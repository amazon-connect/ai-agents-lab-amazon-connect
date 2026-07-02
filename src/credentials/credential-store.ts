// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * In-memory credential storage.
 *
 * Credentials are held in a module-level variable only — no writes to
 * localStorage, sessionStorage, cookies, or IndexedDB. Credentials are
 * intentionally lost on page refresh.
 */

import type { AWSCredentials } from "./types";

let credentials: AWSCredentials | null = null;

/** Returns the stored AWS credentials, or null if none are present. */
export function getCredentials(): AWSCredentials | null {
  return credentials;
}

/** Replaces any previously stored credentials with the given value. */
export function setCredentials(value: AWSCredentials): void {
  credentials = value;
}

/** Clears the stored credentials so that subsequent getCredentials() returns null. */
export function clearCredentials(): void {
  credentials = null;
}
