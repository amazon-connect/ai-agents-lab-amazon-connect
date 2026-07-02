// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { RetryConfig } from "./types";

/**
 * Default retry configuration for AWS SDK throttling errors.
 * Retries up to 3 times with exponential backoff: 1s, 2s, 4s.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  retryableErrors: ["TooManyRequestsException", "ThrottlingException"],
};

/**
 * Returns a promise that resolves after the specified number of milliseconds.
 * Exported for testability (allows mocking in tests).
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks whether an error is retryable based on its `name` property.
 */
function isRetryable(error: unknown, retryableErrors: string[]): boolean {
  if (error instanceof Error) {
    return retryableErrors.includes(error.name);
  }
  return false;
}

/**
 * Executes a function with exponential backoff retry logic.
 *
 * Retries on errors whose `name` matches one of `config.retryableErrors`.
 * Respects an optional `AbortSignal` — throws immediately if aborted.
 * Delay between retries follows: `baseDelayMs * 2^attempt`.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (!isRetryable(error, config.retryableErrors)) throw error;
      if (signal?.aborted) throw new Error("Aborted");
      if (attempt < config.maxRetries) {
        await delay(config.baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError!;
}
