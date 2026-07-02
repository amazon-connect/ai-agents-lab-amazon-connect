// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Formats the duration between two timestamps as a human-readable string.
 * Returns "Xm Ys" for durations with minutes, "Ys" for sub-minute durations,
 * "Pending" when the contact was initiated recently and has no disconnect yet,
 * or "-" when either timestamp is null or disconnect <= initiation.
 */
export function formatDuration(
  initiation: Date | null,
  disconnect: Date | null
): string {
  if (!initiation) return "-";
  if (!disconnect) {
    // Contact was initiated recently — disconnect data not yet indexed by Connect
    const ageMs = Date.now() - initiation.getTime();
    return ageMs < 5 * 60 * 1000 ? "Pending" : "-";
  }
  const diffMs = disconnect.getTime() - initiation.getTime();
  if (diffMs <= 0) return "-";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
