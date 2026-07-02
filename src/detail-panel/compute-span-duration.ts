// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Result of duration computation.
 * null → display "-"
 * 0 → display "0ms"
 * positive → pass to formatDuration()
 */
export type DurationResult = number | null;

/**
 * Computes the duration between two ISO 8601 timestamps in milliseconds.
 * Returns null if either timestamp is missing or invalid.
 * Returns 0 if end ≤ start.
 * Otherwise returns Math.floor(Math.abs(end - start)).
 */
export function computeSpanDuration(
  startTimestamp: string | null | undefined,
  endTimestamp: string | null | undefined
): DurationResult {
  if (startTimestamp == null || endTimestamp == null) {
    return null;
  }

  const startMs = Date.parse(startTimestamp);
  const endMs = Date.parse(endTimestamp);

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }

  if (endMs <= startMs) {
    return 0;
  }

  return Math.floor(Math.abs(endMs - startMs));
}
