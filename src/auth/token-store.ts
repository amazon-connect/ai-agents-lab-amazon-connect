// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Token storage backed by sessionStorage.
 *
 * Tokens survive page refreshes within the same tab but are cleared
 * when the tab is closed. On restore, the token is validated against
 * its stored expiry timestamp — expired tokens are discarded.
 */

const STORAGE_KEY_TOKEN = "auth_access_token";
const STORAGE_KEY_EXPIRES_AT = "auth_expires_at";

/** Buffer in ms — treat token as expired 60s before actual expiry. */
const EXPIRY_BUFFER_MS = 60_000;

/** Returns the stored access token if present and not expired, otherwise null. */
export function getToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_KEY_TOKEN);
  const expiresAt = sessionStorage.getItem(STORAGE_KEY_EXPIRES_AT);

  if (!token) return null;

  // If we have an expiry timestamp, check it
  if (expiresAt) {
    const expiresAtMs = Number(expiresAt);
    if (Date.now() >= expiresAtMs - EXPIRY_BUFFER_MS) {
      // Token is expired or about to expire — clear it
      clearToken();
      return null;
    }
  }

  return token;
}

/**
 * Stores the access token with an optional expiry.
 * @param value - The access token string
 * @param expiresIn - Token lifetime in seconds (from token response)
 */
export function setToken(value: string, expiresIn?: number): void {
  sessionStorage.setItem(STORAGE_KEY_TOKEN, value);

  if (expiresIn && expiresIn > 0) {
    const expiresAtMs = Date.now() + expiresIn * 1000;
    sessionStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(expiresAtMs));
  } else {
    // Try to extract exp from JWT claims as fallback
    const exp = extractExpFromJwt(value);
    if (exp) {
      sessionStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(exp * 1000));
    }
  }
}

/** Clears the stored token and expiry. */
export function clearToken(): void {
  sessionStorage.removeItem(STORAGE_KEY_TOKEN);
  sessionStorage.removeItem(STORAGE_KEY_EXPIRES_AT);
}

/** Extracts the `exp` claim from a JWT without signature verification. */
function extractExpFromJwt(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(decoded) as Record<string, unknown>;
    if (typeof claims.exp === "number") return claims.exp;
    return null;
  } catch {
    return null;
  }
}
