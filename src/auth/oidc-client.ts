// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SSOOIDCClient, CreateTokenCommand } from "@aws-sdk/client-sso-oidc";
import { generateCodeVerifier, deriveCodeChallenge, generateState } from "./pkce";
import { setToken } from "./token-store";
import type { OIDCConfig } from "./types";

/** SessionStorage keys for PKCE flow data that must survive the redirect. */
const STORAGE_KEY_VERIFIER = "oidc_code_verifier";
const STORAGE_KEY_STATE = "oidc_state";

/**
 * Initiates the OIDC Authorization Code Flow with PKCE.
 *
 * Generates a code verifier, derives the S256 challenge, generates a random
 * state parameter, stores verifier + state in sessionStorage, and redirects
 * the browser to the Identity Center authorization endpoint.
 *
 * The clientId in config is a registered OIDC client ID (obtained via RegisterClient
 * at deploy time), NOT the application ARN.
 */
export async function initiateLogin(config: OIDCConfig): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const state = generateState();

  sessionStorage.setItem(STORAGE_KEY_VERIFIER, verifier);
  sessionStorage.setItem(STORAGE_KEY_STATE, state);

  const authorizeUrl = buildAuthorizeUrl(config, challenge, state);
  window.location.href = authorizeUrl;
}

/**
 * Handles the OIDC callback after the user authenticates with the IdP.
 *
 * Validates the state parameter, retrieves the stored code verifier, exchanges
 * the authorization code for an access token via the SSO OIDC token endpoint,
 * stores the token in memory, clears sessionStorage, and returns decoded claims.
 */
export async function handleCallback(
  code: string,
  state: string,
  config: OIDCConfig
): Promise<{ displayName: string }> {
  const storedState = sessionStorage.getItem(STORAGE_KEY_STATE);

  if (state !== storedState) {
    throw new Error("Security error: state mismatch");
  }

  const verifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  if (!verifier) {
    throw new Error("Missing code verifier in session storage");
  }

  const client = new SSOOIDCClient({
    region: config.region,
    ...(import.meta.env.DEV && { endpoint: 'http://127.0.0.1:5173/sso-oidc' }),
  });
  const command = new CreateTokenCommand({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    grantType: "authorization_code",
    code,
    redirectUri: config.redirectUri,
    codeVerifier: verifier,
  });

  let response;
  try {
    response = await client.send(command);
  } catch (err: unknown) {
    // Log the full error for debugging
    console.error("CreateToken failed:", JSON.stringify(err, null, 2));
    const msg = err instanceof Error ? err.message : "Token exchange failed";
    const detail = (err as { error_description?: string }).error_description;
    throw new Error(detail ?? msg);
  }

  const accessToken = response.accessToken;
  if (!accessToken) {
    throw new Error("No access token in token response");
  }

  setToken(accessToken, response.expiresIn);

  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_STATE);

  // Identity Center access tokens from RegisterClient flows don't carry
  // user profile claims. Extract what we can from the JWT as a best-effort.
  const claims = decodeTokenClaims(accessToken);
  const displayName = resolveDisplayName(claims);

  return { displayName };
}

/**
 * Builds the full authorization URL with all required query parameters.
 */
export function buildAuthorizeUrl(
  config: OIDCConfig,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: "sso:account:access",
  });

  return `${config.issuerUrl}/authorize?${params.toString()}`;
}

/**
 * Decodes the payload of a JWT without verifying the signature.
 * Identity Center access tokens are JWTs; we only need the claims for display name.
 */
function decodeTokenClaims(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return {};
    }
    const payload = parts[1]!;
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    console.warn("Failed to decode JWT claims, using fallback display name");
    return {};
  }
}

/**
 * Resolves the display name from token claims or userinfo using the fallback chain:
 * name → email → preferred_username → sub → "User"
 */
export function resolveDisplayName(claims: Record<string, unknown>): string {
  if (typeof claims.name === "string" && claims.name.length > 0) {
    return claims.name;
  }
  if (typeof claims.email === "string" && claims.email.length > 0) {
    return claims.email;
  }
  if (typeof claims.preferred_username === "string" && claims.preferred_username.length > 0) {
    return claims.preferred_username;
  }
  if (typeof claims.sub === "string" && claims.sub.length > 0 && claims.sub.includes("@")) {
    // Only use sub if it looks like an email/username, not an opaque ID
    return claims.sub;
  }
  return "User";
}
