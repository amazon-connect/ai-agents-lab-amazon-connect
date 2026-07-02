// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from "react";

import type {
  BatchAggregateStats,
  BatchConfig,
  IterationResult,
} from "../test-harness/batch-types";

/** In-memory state for a batch run. */
export interface BatchResultState {
  status: "idle" | "running" | "stopping" | "completed";
  scriptName: string;
  agentArn: string;
  iterationCount: number;
  concurrencyLimit: number;
  startTimestamp: string; // ISO 8601 UTC
  endTimestamp?: string;
  iterations: IterationResult[];
  aggregateStats?: BatchAggregateStats;
}

/**
 * React hook managing in-memory batch result state.
 *
 * Starts with `null` (no batch running). On `startBatch`, replaces any
 * previous results with a fresh state. Iterations are appended or updated
 * via `updateIteration`. `completeBatch` finalises the run, and `reset`
 * clears everything back to null.
 */
export function useBatchState() {
  const [state, setState] = useState<BatchResultState | null>(null);

  const startBatch = useCallback((config: BatchConfig) => {
    setState({
      status: "running",
      scriptName: config.script.name,
      agentArn: config.agentArn,
      iterationCount: config.iterationCount,
      concurrencyLimit: config.concurrencyLimit,
      startTimestamp: new Date().toISOString(),
      iterations: [],
    });
  }, []);

  const updateIteration = useCallback((result: IterationResult) => {
    setState((prev) => {
      if (!prev) return prev;
      const idx = prev.iterations.findIndex(
        (it) => it.iterationNumber === result.iterationNumber,
      );
      const iterations =
        idx >= 0
          ? prev.iterations.map((it, i) => (i === idx ? result : it))
          : [...prev.iterations, result];
      return { ...prev, iterations };
    });
  }, []);

  const completeBatch = useCallback((stats: BatchAggregateStats) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: "completed",
        endTimestamp: new Date().toISOString(),
        aggregateStats: stats,
      };
    });
  }, []);

  const updateConcurrency = useCallback((n: number) => {
    setState((prev) => {
      if (!prev) return prev;
      return { ...prev, concurrencyLimit: n };
    });
  }, []);

  const reset = useCallback(() => {
    setState(null);
  }, []);

  return { state, startBatch, updateIteration, completeBatch, updateConcurrency, reset };
}
