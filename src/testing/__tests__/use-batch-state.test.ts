// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchState } from "../use-batch-state";
import type { BatchConfig, IterationResult, BatchAggregateStats } from "../../test-harness/batch-types";

function makeBatchConfig(overrides: Partial<BatchConfig> = {}): BatchConfig {
  return {
    script: { name: "Login flow", turns: [] },
    iterationCount: 10,
    concurrencyLimit: 5,
    agentArn: "arn:aws:connect:us-east-1:123456789:instance/i-1/agent/a-1",
    credentials: { accessKeyId: "key", secretAccessKey: "secret", sessionToken: "token", expiration: Date.now() + 3600000 },
    region: "us-east-1",
    instanceId: "i-1",
    contactFlowId: "cf-1",
    ...overrides,
  };
}

function makeIterationResult(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    iterationNumber: 1,
    status: "completed",
    durationMs: 1000,
    turnsCompleted: 3,
    turnsTotal: 3,
    retryCount: 0,
    ...overrides,
  };
}

describe("useBatchState", () => {
  it("starts with null state", () => {
    const { result } = renderHook(() => useBatchState());
    expect(result.current.state).toBeNull();
  });

  it("startBatch initializes state with running status and empty iterations", () => {
    const { result } = renderHook(() => useBatchState());
    const config = makeBatchConfig();

    act(() => {
      result.current.startBatch(config);
    });

    const state = result.current.state!;
    expect(state.status).toBe("running");
    expect(state.scriptName).toBe("Login flow");
    expect(state.agentArn).toBe("arn:aws:connect:us-east-1:123456789:instance/i-1/agent/a-1");
    expect(state.iterationCount).toBe(10);
    expect(state.concurrencyLimit).toBe(5);
    expect(state.iterations).toEqual([]);
    expect(state.startTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("startBatch replaces previous results", () => {
    const { result } = renderHook(() => useBatchState());

    act(() => {
      result.current.startBatch(makeBatchConfig({ iterationCount: 5 }));
    });
    act(() => {
      result.current.updateIteration(makeIterationResult({ iterationNumber: 1 }));
    });

    // Start a new batch — previous iterations should be gone
    act(() => {
      result.current.startBatch(makeBatchConfig({ iterationCount: 20 }));
    });

    const state = result.current.state!;
    expect(state.iterationCount).toBe(20);
    expect(state.iterations).toEqual([]);
  });

  it("updateIteration appends a new iteration", () => {
    const { result } = renderHook(() => useBatchState());

    act(() => {
      result.current.startBatch(makeBatchConfig());
    });
    act(() => {
      result.current.updateIteration(makeIterationResult({ iterationNumber: 1 }));
    });

    expect(result.current.state!.iterations).toHaveLength(1);
    expect(result.current.state!.iterations[0]!.iterationNumber).toBe(1);
  });

  it("updateIteration updates an existing iteration by iterationNumber", () => {
    const { result } = renderHook(() => useBatchState());

    act(() => {
      result.current.startBatch(makeBatchConfig());
    });
    act(() => {
      result.current.updateIteration(makeIterationResult({ iterationNumber: 1, status: "running", durationMs: 0 }));
    });
    act(() => {
      result.current.updateIteration(makeIterationResult({ iterationNumber: 1, status: "completed", durationMs: 2000 }));
    });

    expect(result.current.state!.iterations).toHaveLength(1);
    expect(result.current.state!.iterations[0]!.status).toBe("completed");
    expect(result.current.state!.iterations[0]!.durationMs).toBe(2000);
  });

  it("updateIteration does nothing when state is null", () => {
    const { result } = renderHook(() => useBatchState());

    act(() => {
      result.current.updateIteration(makeIterationResult());
    });

    expect(result.current.state).toBeNull();
  });

  it("completeBatch sets status to completed with stats and endTimestamp", () => {
    const { result } = renderHook(() => useBatchState());
    const stats: BatchAggregateStats = {
      counts: { completed: 8, exit_branch: 1, max_timeout: 1, user_stopped: 0, failed: 0 },
      latency: { average: 3000, p50: 2800, p95: 5000 },
      totalDurationMs: 30000,
    };

    act(() => {
      result.current.startBatch(makeBatchConfig());
    });
    act(() => {
      result.current.completeBatch(stats);
    });

    const state = result.current.state!;
    expect(state.status).toBe("completed");
    expect(state.aggregateStats).toEqual(stats);
    expect(state.endTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("completeBatch does nothing when state is null", () => {
    const { result } = renderHook(() => useBatchState());
    const stats: BatchAggregateStats = {
      counts: { completed: 0, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
      latency: null,
      totalDurationMs: 0,
    };

    act(() => {
      result.current.completeBatch(stats);
    });

    expect(result.current.state).toBeNull();
  });

  it("reset sets state back to null", () => {
    const { result } = renderHook(() => useBatchState());

    act(() => {
      result.current.startBatch(makeBatchConfig());
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBeNull();
  });
});
