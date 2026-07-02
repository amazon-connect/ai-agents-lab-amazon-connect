// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import {
  computeAggregateStats,
  percentile,
  formatElapsedTime,
} from "../batch-stats";
import type { IterationResult } from "../batch-types";
import type { ConversationTranscript } from "../script-types";

/** Helper to create a minimal transcript for testing. */
function makeTranscript(): ConversationTranscript {
  return {
    scriptName: "test",
    agentArn: "arn:aws:connect:us-east-1:123:instance/1/agent/2",
    terminationReason: "completed",
    totalDurationMs: 1000,
    turnsCompleted: 1,
    turnsTotal: 1,
    turns: [],
  };
}

/** Helper to create an iteration result. */
function makeResult(
  overrides: Partial<IterationResult> = {}
): IterationResult {
  return {
    iterationNumber: 1,
    status: "completed",
    terminationReason: "completed",
    transcript: makeTranscript(),
    durationMs: 1000,
    turnsCompleted: 1,
    turnsTotal: 1,
    retryCount: 0,
    ...overrides,
  };
}

describe("batch-stats", () => {
  describe("computeAggregateStats", () => {
    it("returns zero counts and null latency for empty results", () => {
      const stats = computeAggregateStats([]);
      expect(stats.counts).toEqual({
        completed: 0,
        exit_branch: 0,
        max_timeout: 0,
        user_stopped: 0,
        failed: 0,
      });
      expect(stats.latency).toBeNull();
      expect(stats.totalDurationMs).toBe(0);
    });

    it("counts termination reasons correctly", () => {
      const results: IterationResult[] = [
        makeResult({ iterationNumber: 1, terminationReason: "completed", durationMs: 100 }),
        makeResult({ iterationNumber: 2, terminationReason: "completed", durationMs: 200 }),
        makeResult({ iterationNumber: 3, terminationReason: "exit_branch", durationMs: 150 }),
        makeResult({ iterationNumber: 4, terminationReason: "max_timeout", durationMs: 300 }),
        makeResult({ iterationNumber: 5, terminationReason: "failed", transcript: undefined, durationMs: 50 }),
      ];

      const stats = computeAggregateStats(results);
      expect(stats.counts.completed).toBe(2);
      expect(stats.counts.exit_branch).toBe(1);
      expect(stats.counts.max_timeout).toBe(1);
      expect(stats.counts.failed).toBe(1);
      expect(stats.counts.user_stopped).toBe(0);
    });

    it("computes totalDurationMs as sum of all iteration durations", () => {
      const results = [
        makeResult({ durationMs: 1000 }),
        makeResult({ durationMs: 2000 }),
        makeResult({ durationMs: 3000 }),
      ];

      const stats = computeAggregateStats(results);
      expect(stats.totalDurationMs).toBe(6000);
    });

    it("computes latency stats only from iterations with transcripts", () => {
      const results = [
        makeResult({ durationMs: 1000, transcript: makeTranscript() }),
        makeResult({ durationMs: 2000, transcript: makeTranscript() }),
        makeResult({ durationMs: 3000, transcript: undefined, terminationReason: "failed" }),
      ];

      const stats = computeAggregateStats(results);
      expect(stats.latency).not.toBeNull();
      expect(stats.latency!.average).toBe(1500);
      expect(stats.latency!.p50).toBe(1500);
      expect(stats.latency!.p95).toBe(1950);
    });

    it("returns null latency when no iterations have transcripts", () => {
      const results = [
        makeResult({ durationMs: 1000, transcript: undefined, terminationReason: "failed" }),
        makeResult({ durationMs: 2000, transcript: undefined, terminationReason: "failed" }),
      ];

      const stats = computeAggregateStats(results);
      expect(stats.latency).toBeNull();
    });

    it("treats missing terminationReason as failed", () => {
      const results = [
        makeResult({ terminationReason: undefined, transcript: undefined }),
      ];

      const stats = computeAggregateStats(results);
      expect(stats.counts.failed).toBe(1);
    });
  });

  describe("percentile", () => {
    it("returns 0 for empty array", () => {
      expect(percentile([], 50)).toBe(0);
    });

    it("returns the single value for a one-element array", () => {
      expect(percentile([42], 50)).toBe(42);
      expect(percentile([42], 0)).toBe(42);
      expect(percentile([42], 100)).toBe(42);
    });

    it("returns the median for p50 with odd-length array", () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });

    it("interpolates for p50 with even-length array", () => {
      expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    });

    it("returns the first element for p0", () => {
      expect(percentile([10, 20, 30], 0)).toBe(10);
    });

    it("returns the last element for p100", () => {
      expect(percentile([10, 20, 30], 100)).toBe(30);
    });

    it("computes p95 correctly", () => {
      // 10 values: rank = 0.95 * 9 = 8.55
      // Interpolate between index 8 (90) and index 9 (100)
      // 90 + 0.55 * (100 - 90) = 90 + 5.5 = 95.5
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(percentile(values, 95)).toBeCloseTo(95.5, 10);
    });
  });

  describe("formatElapsedTime", () => {
    it("formats 0 ms as 00:00:00", () => {
      expect(formatElapsedTime(0)).toBe("00:00:00");
    });

    it("formats seconds correctly", () => {
      expect(formatElapsedTime(5000)).toBe("00:00:05");
    });

    it("formats minutes correctly", () => {
      expect(formatElapsedTime(90_000)).toBe("00:01:30");
    });

    it("formats hours correctly", () => {
      expect(formatElapsedTime(3_661_000)).toBe("01:01:01");
    });

    it("zero-pads single-digit values", () => {
      expect(formatElapsedTime(1000)).toBe("00:00:01");
      expect(formatElapsedTime(60_000)).toBe("00:01:00");
      expect(formatElapsedTime(3_600_000)).toBe("01:00:00");
    });

    it("handles large hour values", () => {
      // 100 hours
      expect(formatElapsedTime(360_000_000)).toBe("100:00:00");
    });

    it("truncates sub-second precision", () => {
      expect(formatElapsedTime(1999)).toBe("00:00:01");
      expect(formatElapsedTime(999)).toBe("00:00:00");
    });

    it("treats negative values as 0", () => {
      expect(formatElapsedTime(-5000)).toBe("00:00:00");
    });
  });
});
