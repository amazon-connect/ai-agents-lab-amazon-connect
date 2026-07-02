// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * BatchRunner — orchestrates N iterations of a test script with
 * semaphore-gated concurrency, backoff retry on throttling, and
 * AbortSignal support for Stop All.
 */

import type {
  BatchConfig,
  BatchRunnerCallbacks,
  BatchAggregateStats,
  BatchProgress,
  IterationResult,
} from "./batch-types";
import type {
  ConversationTranscript,
  ScriptRunnerCallbacks,
  RunScriptParams,
} from "./script-types";
import { Semaphore } from "./semaphore";
import {
  computeBackoffDelay,
  isThrottlingError,
  DEFAULT_BACKOFF_CONFIG,
} from "./backoff";
import { computeAggregateStats } from "./batch-stats";
import { runScript } from "./script-runner";

/**
 * Sleep for the given number of milliseconds.
 * Rejects early if the AbortSignal fires.
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run a batch of N iterations with semaphore-gated concurrency.
 *
 * - Assigns sequential 1-based iteration numbers.
 * - Retries on throttling errors using exponential backoff.
 * - Emits callbacks for progress tracking.
 * - Handles AbortSignal for Stop All behavior.
 * - Isolates failures: individual iteration errors don't abort the batch.
 * - Supports live concurrency adjustment via the returned `setConcurrency` function.
 */
export function runBatch(
  config: BatchConfig,
  callbacks: BatchRunnerCallbacks,
  signal: AbortSignal
): { promise: Promise<BatchAggregateStats>; setConcurrency: (n: number) => void } {
  const { iterationCount, concurrencyLimit } = config;
  const semaphore = new Semaphore(concurrencyLimit);
  const results: IterationResult[] = [];

  // Track progress counts
  let completedCount = 0;
  let activeCount = 0;
  let queuedCount = iterationCount;

  function emitProgress(): void {
    const progress: BatchProgress = {
      completed: completedCount,
      active: activeCount,
      queued: queuedCount,
      total: iterationCount,
    };
    callbacks.onProgressUpdate(progress);
  }

  /**
   * Execute a single iteration with retry on throttling errors.
   */
  async function executeIteration(iterationNumber: number): Promise<IterationResult> {
    // Wait for a semaphore slot
    await semaphore.acquire();

    // After acquiring, check if aborted (iteration was queued and abort fired)
    if (signal.aborted) {
      semaphore.release();
      return {
        iterationNumber,
        status: "completed",
        terminationReason: "user_stopped",
        durationMs: 0,
        turnsCompleted: 0,
        turnsTotal: config.script.turns.length,
        retryCount: 0,
      };
    }

    // Transition from queued to active
    queuedCount--;
    activeCount++;
    emitProgress();

    callbacks.onIterationStart(iterationNumber);

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: unknown = null;

    // Retry loop for throttling errors
    for (let attempt = 0; attempt <= DEFAULT_BACKOFF_CONFIG.maxRetries; attempt++) {
      if (signal.aborted) {
        const durationMs = Date.now() - startTime;
        semaphore.release();
        return {
          iterationNumber,
          status: "completed",
          terminationReason: "user_stopped",
          durationMs,
          turnsCompleted: 0,
          turnsTotal: config.script.turns.length,
          retryCount,
        };
      }

      try {
        // Create a per-iteration AbortController that aborts when the batch signal fires
        const iterationController = new AbortController();
        const onBatchAbort = (): void => {
          iterationController.abort();
        };
        signal.addEventListener("abort", onBatchAbort, { once: true });

        const params: RunScriptParams = {
          script: config.script,
          agentArn: config.agentArn,
          credentials: config.credentials,
          region: config.region,
          instanceId: config.instanceId,
          contactFlowId: config.contactFlowId,
          useVariations: config.useVariations,
          settleDurationMs: config.settleDurationMs,
        };
        console.log("[batch-runner] useVariations:", config.useVariations, "turns with variations:", config.script.turns.filter(t => t.variations?.length).length);

        // Create no-op callbacks for the inner runScript — the batch runner
        // only cares about the final transcript result.
        let contactId: string | undefined;
        const scriptCallbacks: ScriptRunnerCallbacks = {
          onProgress: () => {},
          onTurnComplete: () => {},
          onMessage: () => {},
          onTypingStart: () => {},
          onTypingStop: () => {},
          onSessionStart: (id: string) => {
            contactId = id;
          },
          onComplete: () => {},
          onError: () => {},
        };

        const transcript: ConversationTranscript = await runScript(
          params,
          scriptCallbacks,
          iterationController.signal
        );

        // Clean up listener if we completed normally
        signal.removeEventListener("abort", onBatchAbort);

        // Use the transcript's totalDurationMs (excludes connection setup)
        const durationMs = transcript.totalDurationMs || (Date.now() - startTime);

        const result: IterationResult = {
          iterationNumber,
          status: "completed",
          terminationReason: transcript.terminationReason,
          transcript,
          durationMs,
          contactId,
          turnsCompleted: transcript.turnsCompleted,
          turnsTotal: transcript.turnsTotal,
          retryCount,
        };

        semaphore.release();
        return result;
      } catch (error: unknown) {
        // Clean up abort listener on error path
        signal.removeEventListener("abort", () => {});

        if (isThrottlingError(error) && attempt < DEFAULT_BACKOFF_CONFIG.maxRetries) {
          // Throttling error — apply backoff and retry
          lastError = error;
          retryCount++;

          const delay = computeBackoffDelay(attempt);
          try {
            await abortableSleep(delay, signal);
          } catch {
            // Aborted during backoff sleep
            const durationMs = Date.now() - startTime;
            semaphore.release();
            return {
              iterationNumber,
              status: "completed",
              terminationReason: "user_stopped",
              durationMs,
              turnsCompleted: 0,
              turnsTotal: config.script.turns.length,
              retryCount,
            };
          }
          continue;
        }

        // Non-throttling error or max retries exhausted — mark as failed
        const durationMs = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        callbacks.onError(iterationNumber, error);

        const result: IterationResult = {
          iterationNumber,
          status: "failed",
          terminationReason: "failed",
          errorMessage,
          durationMs,
          turnsCompleted: 0,
          turnsTotal: config.script.turns.length,
          retryCount,
        };

        semaphore.release();
        return result;
      }
    }

    // Should not reach here, but handle max retries exhausted for throttling
    const durationMs = Date.now() - startTime;
    const errorMessage =
      lastError instanceof Error ? lastError.message : "Max retries exceeded";

    callbacks.onError(iterationNumber, lastError ?? new Error("Max retries exceeded"));

    const result: IterationResult = {
      iterationNumber,
      status: "failed",
      terminationReason: "failed",
      errorMessage,
      durationMs,
      turnsCompleted: 0,
      turnsTotal: config.script.turns.length,
      retryCount,
    };

    semaphore.release();
    return result;
  }

  // Launch all iterations concurrently (semaphore gates actual execution)
  const iterationPromises: Promise<void>[] = [];

  for (let i = 1; i <= iterationCount; i++) {
    const iterationNumber = i;

    const promise = executeIteration(iterationNumber).then((result) => {
      results.push(result);

      // Update progress counters
      activeCount--;
      completedCount++;
      emitProgress();

      callbacks.onIterationComplete(result);
    });

    iterationPromises.push(promise);
  }

  // Wait for all iterations to settle, then compute aggregate stats
  const promise = Promise.all(iterationPromises).then(() => {
    const stats = computeAggregateStats(results);
    callbacks.onBatchComplete(stats);
    return stats;
  });

  return {
    promise,
    setConcurrency: (n: number) => semaphore.resize(n),
  };
}
