// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * PKCE (Proof Key for Code Exchange) utilities for OIDC Authorization Code Flow.
 * Uses the Web Crypto API for cryptographically secure random generation and hashing.
 */

/** Unreserved URI characters per RFC 3986 */
const UNRESERVED_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * Generates a cryptographically random code verifier string.
 * The verifier is between 43 and 128 characters, using only unreserved URI characters.
 *
 * @returns A random code verifier string of 128 characters
 */
export function generateCodeVerifier(): string {
  const length = 128;
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let verifier = "";
  for (let i = 0; i < length; i++) {
    verifier += UNRESERVED_CHARS[randomValues[i]! % UNRESERVED_CHARS.length];
  }
  return verifier;
}

/**
 * Derives a code challenge from a code verifier using the S256 method.
 * Computes SHA-256 hash of the verifier and encodes it as base64url (no padding).
 *
 * @param verifier - The code verifier string to hash
 * @returns A base64url-encoded SHA-256 hash (43 characters, no padding)
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

/**
 * Generates a cryptographically random state parameter for CSRF protection.
 *
 * @returns A random base64url-encoded string
 */
export function generateState(): string {
  const randomValues = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(randomValues.buffer);
}

/**
 * Encodes an ArrayBuffer as a base64url string without padding.
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
