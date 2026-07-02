// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { OIDCConfig } from "./types";

/**
 * Returns true if dev bypass mode is active:
 * VITE_AUTH_BYPASS must be exactly "true" AND the app must NOT be a production build.
 */
export function isDevBypass(): boolean {
  return (
    import.meta.env.VITE_AUTH_BYPASS === "true" &&
    import.meta.env.PROD === false
  );
}

/**
 * Reads and validates OIDC configuration from environment variables.
 *
 * - Returns `null` if dev bypass mode is active (non-production + VITE_AUTH_BYPASS=true)
 * - Throws a descriptive error naming the missing variable if any required var is absent
 * - Throws if URL variables don't start with `https://`
 */
export function getOIDCConfig(): OIDCConfig | null {
  if (isDevBypass()) {
    return null;
  }

  const requiredVars = [
    "VITE_OIDC_ISSUER_URL",
    "VITE_OIDC_CLIENT_ID",
    "VITE_OIDC_CLIENT_SECRET",
    "VITE_OIDC_REDIRECT_URI",
    "VITE_AWS_REGION",
  ] as const;

  const values: Record<string, string> = {};

  for (const varName of requiredVars) {
    const value = import.meta.env[varName];
    if (!value) {
      throw new Error(
        `Missing required environment variable: ${varName}`
      );
    }
    values[varName] = value;
  }

  // Validate issuer URL must be HTTPS
  if (!values["VITE_OIDC_ISSUER_URL"]!.startsWith("https://")) {
    throw new Error("VITE_OIDC_ISSUER_URL must start with https://");
  }

  // Validate redirect URI: HTTPS required, except loopback (http://127.0.0.1 or http://localhost) for dev
  const redirectUri = values["VITE_OIDC_REDIRECT_URI"]!;
  const isLoopback = redirectUri.startsWith("http://127.0.0.1") || redirectUri.startsWith("http://localhost");
  if (!redirectUri.startsWith("https://") && !isLoopback) {
    throw new Error("VITE_OIDC_REDIRECT_URI must start with https:// or use http://127.0.0.1 for local development");
  }

  return {
    issuerUrl: values["VITE_OIDC_ISSUER_URL"]!,
    clientId: values["VITE_OIDC_CLIENT_ID"]!,
    clientSecret: values["VITE_OIDC_CLIENT_SECRET"]!,
    redirectUri: values["VITE_OIDC_REDIRECT_URI"]!,
    region: values["VITE_AWS_REGION"]!,
  };
}
