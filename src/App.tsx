// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { BrowserRouter, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { CredentialsProvider } from './credentials/CredentialsContext';
import { WorkspaceProvider } from './workspace/WorkspaceContext';
import { SplitPanelProvider } from './layouts/SplitPanelContext';
import { AppNotificationProvider, useAppNotifications } from './layouts/AppNotificationContext';
import AppShell from './layouts/AppShell';
import AppRoutes from './routes';
import { useRef } from 'react';

// Bridge: lets CredentialsProvider (outside AppNotificationProvider) report errors upward.
// AppInner registers the reportError function into this ref once it mounts.
function useErrorBridgeRef() {
  return useRef<((err: unknown) => void) | null>(null);
}

function AppInner({ onRefreshErrorRef }: { onRefreshErrorRef: React.MutableRefObject<((err: unknown) => void) | null> }) {
  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <AppNotificationProvider
      onReauthenticate={login}
      onNavigateToPermissions={() => navigate("/settings/permissions")}
    >
      <ErrorBridgeRegistrar onRefreshErrorRef={onRefreshErrorRef} />
      <WorkspaceProvider>
        <SplitPanelProvider>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </SplitPanelProvider>
      </WorkspaceProvider>
    </AppNotificationProvider>
  );
}

/** Registers reportError into the bridge ref so CredentialsProvider can call it. */
function ErrorBridgeRegistrar({ onRefreshErrorRef }: { onRefreshErrorRef: React.MutableRefObject<((err: unknown) => void) | null> }) {
  const { reportError } = useAppNotifications();
  onRefreshErrorRef.current = reportError;
  return null;
}

function App() {
  const onRefreshErrorRef = useErrorBridgeRef();

  return (
    <BrowserRouter>
      <AuthProvider>
        <CredentialsProvider onRefreshError={(err) => onRefreshErrorRef.current?.(err)}>
          <AppInner onRefreshErrorRef={onRefreshErrorRef} />
        </CredentialsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
