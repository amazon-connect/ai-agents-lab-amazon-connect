// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Backoff strategy for handling Connect API throttling errors. */

/** Configuration for exponential backoff retry behavior. */
export interface BackoffConfig {
  initialDelayMs: number; // Base delay for first retry
  maxDelayMs: number; // Maximum delay cap
  maxRetries: number; // Maximum retry attempts before failing
  jitterMaxMs: number; // Maximum random jitter added to each delay
}

/** Default backoff configuration matching Connect API rate limits. */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  maxRetries: 5,
  jitterMaxMs: 500,
};

/**
 * Compute the delay for a given retry attempt (0-based).
 *
 * Formula: min(2^attempt * initialDelayMs, maxDelayMs) + jitter
 * where jitter is a random value in [0, jitterMaxMs].
 */
export function computeBackoffDelay(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number {
  const exponentialDelay = Math.min(
    Math.pow(2, attempt) * config.initialDelayMs,
    config.maxDelayMs
  );
  const jitter = Math.random() * config.jitterMaxMs;
  return exponentialDelay + jitter;
}

/**
 * Returns true if the error is a throttling error that should trigger retry.
 *
 * Detects `TooManyRequestsException` and `ThrottlingException` from the
 * Connect API by checking the error's `name` property.
 */
export function isThrottlingError(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }

  const name = (error as { name?: string }).name;
  return name === "TooManyRequestsException" || name === "ThrottlingException";
}
