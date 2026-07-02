// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Batch statistics utilities for computing aggregate metrics. */

import type { TerminationReason, TurnTranscript } from "./script-types";
import type { BatchAggregateStats, IterationResult } from "./batch-types";
import type { VoiceTurnTranscript } from "./voice-types";

/**
 * Compute aggregate statistics from iteration results.
 *
 * Counts each termination reason, computes average/p50/p95 latency from
 * iterations that produced a transcript, and sums total duration.
 */
export function computeAggregateStats(results: IterationResult[]): BatchAggregateStats {
  // Initialize counts for all termination reasons
  const counts: Record<TerminationReason | "failed", number> = {
    completed: 0,
    exit_branch: 0,
    max_timeout: 0,
    user_stopped: 0,
    failed: 0,
  };

  // Count each termination reason
  for (const result of results) {
    const reason = result.terminationReason ?? "failed";
    counts[reason]++;
  }

  // Compute total duration across all iterations
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  // Compute latency stats from iterations that produced a transcript (chat)
  // or voiceTurns (voice).
  // Use per-response latencies (responseLatencies) when available, flattened
  // across all turns of all iterations. Falls back to per-turn latencyMs.
  // If no turns have latency data, fall back to iteration durationMs.
  const allLatencies: number[] = [];
  for (const result of results) {
    if (result.transcript != null) {
      // Chat iteration
      const turns = result.transcript.turns as TurnTranscript[];
      if (turns.length === 0) {
        // No turn data — use iteration duration as a proxy
        allLatencies.push(result.durationMs);
      } else {
        for (const turn of turns) {
          if (turn.responseLatencies && turn.responseLatencies.length > 0) {
            allLatencies.push(...turn.responseLatencies);
          } else {
            allLatencies.push(turn.latencyMs);
          }
        }
      }
    } else if (result.voiceTurns != null && result.voiceTurns.length > 0) {
      // Voice iteration
      const turns = result.voiceTurns as VoiceTurnTranscript[];
      for (const turn of turns) {
        allLatencies.push(turn.latencyMs);
      }
    }
  }

  let latency: BatchAggregateStats["latency"] = null;

  if (allLatencies.length > 0) {
    const sorted = [...allLatencies].sort((a, b) => a - b);
    const average = allLatencies.reduce((sum, d) => sum + d, 0) / allLatencies.length;

    latency = {
      average: Math.round(average),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
    };
  }

  return { counts, latency, totalDurationMs };
}

/**
 * Compute a percentile from a sorted array of numbers.
 *
 * Uses linear interpolation between closest ranks when the percentile
 * falls between two data points.
 *
 * @param sortedValues - Array of numbers sorted in ascending order
 * @param p - Percentile to compute (0–100)
 * @returns The interpolated percentile value
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0]!;
  }

  // Compute the rank (0-based index) for the given percentile
  const rank = (p / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]!;
  }

  // Linear interpolation between the two surrounding values
  const fraction = rank - lowerIndex;
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;

  return lower + fraction * (upper - lower);
}

/**
 * Format elapsed milliseconds as HH:MM:SS.
 *
 * Hours are unbounded (can exceed 24). Minutes and seconds are zero-padded
 * to two digits and clamped to 0–59.
 *
 * @param ms - Non-negative elapsed time in milliseconds
 * @returns Formatted string in HH:MM:SS format
 */
export function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}
