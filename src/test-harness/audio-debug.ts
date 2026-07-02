// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Lightweight debug logging for the voice audio pipeline.
 *
 * Enabled via `?debug=audio` URL param. Logs are timestamped to make it
 * easier to correlate audio events with what the user is hearing and what
 * spans Connect produces.
 */

const enabled = (() => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "audio";
  } catch {
    return false;
  }
})();

const startTime = Date.now();

/** Log a debug message with a relative timestamp prefix. */
export function audioLog(message: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  if (data) {
    // eslint-disable-next-line no-console
    console.log(`[audio +${elapsed}s] ${message}`, data);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[audio +${elapsed}s] ${message}`);
  }
}

/** True when `?debug=audio` is in the URL. */
export function isAudioDebugEnabled(): boolean {
  return enabled;
}
