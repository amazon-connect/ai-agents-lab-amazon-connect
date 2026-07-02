// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * VoiceBatchRunner — orchestrates N iterations of a voice test script with
 * semaphore-gated concurrency and AbortSignal support for Stop All.
 *
 * Modeled on batch-runner.ts but calls runVoiceScript() instead of runScript().
 * Each iteration manages its own WebRTC call lifecycle independently.
 */

import type {
  BatchRunnerCallbacks,
  BatchAggregateStats,
  BatchProgress,
  IterationResult,
} from "./batch-types";
import type { TestScript } from "./script-types";
import type { AWSCredentials } from "../credentials/types";
import type { VoiceTranscript, VoiceTerminationReason } from "./voice-types";
import { Semaphore } from "./semaphore";
import {
  computeBackoffDelay,
  isThrottlingError,
  DEFAULT_BACKOFF_CONFIG,
} from "./backoff";
import { computeAggregateStats } from "./batch-stats";
import { runVoiceScript } from "./voice-script-executor";
import type { VoiceScriptCallbacks } from "./voice-script-executor";
import { synthesizeUtteranceMap } from "./polly-synthesizer";

// ─── Config ──────────────────────────────────────────────────────────────────

/** Configuration for a voice batch run. */
export interface VoiceBatchConfig {
  script: TestScript;
  iterationCount: number; // 1–1000
  concurrencyLimit: number; // 1–50
  agentArn: string;
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactFlowId: string;
  /** Polly voice ID to use for synthesis (e.g. "Ruth"). */
  voiceId: string;
  /** Polly engine to use (e.g. "generative", "neural", "standard"). */
  engine: "generative" | "neural" | "standard";
  /** Duration of silence (ms) before considering the agent's turn complete. Defaults to 2000. */
  silenceDurationMs?: number;
  /** Enable random utterance sampling from canonical + variations pool. */
  useVariations?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
 * Map a VoiceTerminationReason to the TerminationReason union used by IterationResult.
 *
 * Mapping:
 * - "completed" → "completed"
 * - "max_timeout" → "max_timeout"
 * - "user_stopped" → "user_stopped"
 * - "connection_lost" | "decode_error" → treated as "failed" (error condition)
 */
function mapTerminationReason(
  reason: VoiceTerminationReason
): "completed" | "max_timeout" | "user_stopped" | "failed" {
  switch (reason) {
    case "completed":
      return "completed";
    case "max_timeout":
      return "max_timeout";
    case "user_stopped":
      return "user_stopped";
    case "connection_lost":
    case "decode_error":
      return "failed";
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Run a batch of N voice iterations with semaphore-gated concurrency.
 *
 * - Assigns sequential 1-based iteration numbers.
 * - Retries on throttling errors using exponential backoff.
 * - Emits callbacks for progress tracking.
 * - Handles AbortSignal for Stop All behavior.
 * - Isolates failures: individual iteration errors don't abort the batch.
 * - Supports live concurrency adjustment via the returned `setConcurrency` function.
 */
export function runVoiceBatch(
  config: VoiceBatchConfig,
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

  const promise = (async (): Promise<BatchAggregateStats> => {
    // Phase 0: Pre-synthesise all utterance audio upfront (once for all iterations).
    // Collect the full set of unique utterances: canonical + variations (if enabled).
    const utteranceSet = new Set<string>();
    for (const turn of config.script.turns) {
      utteranceSet.add(turn.customer);
      if (config.useVariations && turn.variations) {
        for (const v of turn.variations) {
          utteranceSet.add(v);
        }
      }
    }
    const uniqueUtterances = Array.from(utteranceSet);

    let sharedUtteranceBuffers: Map<string, ArrayBuffer>;
    let totalSynthesisDurationMs = 0;
    const synthesisStart = Date.now();
    try {
      sharedUtteranceBuffers = await synthesizeUtteranceMap({
        utterances: uniqueUtterances,
        credentials: config.credentials,
        region: config.region,
        voiceId: config.voiceId,
        engine: config.engine,
        signal,
      });
      totalSynthesisDurationMs = Date.now() - synthesisStart;
    } catch (error) {
      if (signal.aborted) {
        // Return a minimal aborted stats object
        const stats = computeAggregateStats([]);
        stats.synthesisDurationMs = 0;
        callbacks.onBatchComplete(stats);
        return stats;
      }
      throw error;
    }

    // Phase 1: Execute iterations — all share the pre-synthesised buffers
    const iterationPromises: Promise<void>[] = [];

    for (let i = 1; i <= iterationCount; i++) {
      const iterationNumber = i;

      const iterPromise = executeIteration(iterationNumber, sharedUtteranceBuffers).then(({ result }) => {
        results.push(result);
        activeCount--;
        completedCount++;
        emitProgress();
        callbacks.onIterationComplete(result);
      });

      iterationPromises.push(iterPromise);
    }

    await Promise.all(iterationPromises);
    const stats = computeAggregateStats(results);
    // Report upfront synthesis duration (paid once, not per iteration)
    stats.synthesisDurationMs = totalSynthesisDurationMs;
    callbacks.onBatchComplete(stats);
    return stats;
  })();

  /**
   * Execute a single voice iteration using the pre-synthesised shared utterance buffers.
   */
  async function executeIteration(iterationNumber: number, utteranceBuffers: Map<string, ArrayBuffer>): Promise<{ result: IterationResult }> {
    // Wait for a semaphore slot
    await semaphore.acquire();

    // After acquiring, check if aborted (iteration was queued and abort fired)
    if (signal.aborted) {
      semaphore.release();
      return {
        result: {
          iterationNumber,
          status: "completed",
          terminationReason: "user_stopped",
          durationMs: 0,
          turnsCompleted: 0,
          turnsTotal: config.script.turns.length,
          retryCount: 0,
        },
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
          result: {
            iterationNumber,
            status: "completed",
            terminationReason: "user_stopped",
            durationMs,
            turnsCompleted: 0,
            turnsTotal: config.script.turns.length,
            retryCount,
          },
        };
      }

      try {
        // Create a per-iteration AbortController that aborts when the batch signal fires
        const iterationController = new AbortController();
        const onBatchAbort = (): void => {
          iterationController.abort();
        };
        signal.addEventListener("abort", onBatchAbort, { once: true });

        // Create no-op callbacks for the inner runVoiceScript — the batch runner
        // only cares about the final transcript result.
        let contactId: string | undefined;
        let turnsCompletedSoFar = 0;
        const scriptCallbacks: VoiceScriptCallbacks = {
          onProgress: () => {},
          onSessionStart: (id: string) => {
            contactId = id;
          },
          onCustomerAudioEnd: () => {},
          onAgentAudioStart: () => {},
          onTurnComplete: () => {
            turnsCompletedSoFar++;
            callbacks.onTurnComplete?.(iterationNumber, turnsCompletedSoFar);
          },
          onComplete: () => {},
          onError: () => {},
        };

        const transcript: VoiceTranscript = await runVoiceScript(
          {
            script: config.script,
            agentArn: config.agentArn,
            credentials: config.credentials,
            region: config.region,
            instanceId: config.instanceId,
            contactFlowId: config.contactFlowId,
            utteranceBuffers,
            silenceDurationMs: config.silenceDurationMs,
            muteLocalPlayback: true,
            mockMicrophone: true,
            useVariations: config.useVariations,
          },
          scriptCallbacks,
          iterationController.signal
        );

        // Clean up listener if we completed normally
        signal.removeEventListener("abort", onBatchAbort);

        const durationMs = transcript.totalDurationMs || (Date.now() - startTime);
        const mappedReason = mapTerminationReason(transcript.terminationReason);

        const result: IterationResult = {
          iterationNumber,
          status: mappedReason === "failed" ? "failed" : "completed",
          terminationReason: mappedReason,
          durationMs,
          contactId,
          turnsCompleted: transcript.turnsCompleted,
          turnsTotal: transcript.turnsTotal,
          retryCount,
          voiceTurns: transcript.turns,
          ...(mappedReason === "failed"
            ? { errorMessage: `Voice call terminated: ${transcript.terminationReason}` }
            : {}),
        };

        semaphore.release();
        return { result };
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
              result: {
                iterationNumber,
                status: "completed",
                terminationReason: "user_stopped",
                durationMs,
                turnsCompleted: 0,
                turnsTotal: config.script.turns.length,
                retryCount,
              },
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
        return { result };
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
    return { result };
  }

  return {
    promise,
    setConcurrency: (n: number) => semaphore.resize(n),
  };
}
