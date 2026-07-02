// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Formats a duration in milliseconds as a human-readable string.
 *
 * - Returns "-" for null/undefined inputs
 * - Returns "0ms" for negative or zero values
 * - Returns "{n}ms" for durations < 1000ms
 * - Returns "{s.d}s" (truncated to 1 decimal) for 1000–59999ms
 * - Returns "{m}m {s}s" for durations ≥ 60000ms
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms <= 0) return "0ms";

  if (ms < 1000) {
    return `${Math.floor(ms)}ms`;
  }

  if (ms < 60000) {
    const seconds = Math.floor(ms / 100) / 10;
    return `${seconds.toFixed(1)}s`;
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
