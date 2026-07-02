/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const ssoRegion = env.VITE_AWS_REGION || 'us-east-1';

  return {
  plugins: [react()],
  define: {
    // amazon-chime-sdk-js references `global` (Node.js) — shim it for the browser
    global: 'globalThis',
  },
  esbuild: {
    // Strip console.log/debug from production builds; keep warn/error for real issues
    drop: mode === 'production' ? ['debugger'] : [],
    pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Proxy SSO Portal and OIDC API calls to avoid CORS in local development.
    // These AWS endpoints don't set CORS headers (designed for native apps).
    proxy: {
      '/sso-portal': {
        target: `https://portal.sso.${ssoRegion}.amazonaws.com`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sso-portal/, ''),
      },
      '/sso-oidc': {
        target: `https://oidc.${ssoRegion}.amazonaws.com`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sso-oidc/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          cloudscape: [
            '@cloudscape-design/components',
            '@cloudscape-design/global-styles',
            '@cloudscape-design/design-tokens',
          ],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Exclude Playwright specs — they use @playwright/test's test() which
    // conflicts with Vitest's globals when accidentally picked up here.
    exclude: ['**/node_modules/**', '**/dist/**', 'demo/**'],
  },
  };
})
