// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AWSCredentials } from "../credentials/types";
import type { ContactEvaluation } from "./types";
import { startEvaluation, describeEvaluation } from "./evaluation-client";

// ─── Parameter Types ─────────────────────────────────────────────────────────

export interface StartAndPollParams {
  instanceId: string;
  credentials: AWSCredentials;
  region: string;
  contacts: { contactId: string }[];
  formId: string;
  signal?: AbortSignal;
  onEvaluationUpdate: (evaluation: ContactEvaluation) => void;
  onStartProgress?: (started: number, total: number) => void;
  onPhaseChange?: (phase: "starting" | "polling" | "complete") => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const POLL_BATCH_SIZE = 10;
const START_CONCURRENCY = 5;
const MAX_POLL_RETRIES = 3;
const START_RETRY_BASE_DELAY_MS = 2000;
const START_MAX_RETRIES = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isTerminalStatus(status: ContactEvaluation["status"]): boolean {
  return status === "completed" || status === "failed";
}

function isThrottlingError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "TooManyRequestsException" || err.name === "ThrottlingException";
  }
  return false;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    }, { once: true });
  });
}

/**
 * Adds jitter (±25%) to a delay value to avoid thundering herd.
 */
function jitter(baseMs: number): number {
  const variance = baseMs * 0.25;
  return baseMs + (Math.random() * 2 - 1) * variance;
}

/**
 * Processes items with a concurrency limit using a semaphore pattern.
 * Calls `fn` for each item, up to `concurrency` at a time.
 */
async function concurrentProcess<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let nextIndex = 0;
  const total = items.length;

  async function worker(): Promise<void> {
    while (nextIndex < total) {
      if (signal?.aborted) throw new Error("Aborted");
      const idx = nextIndex++;
      await fn(items[idx]!, idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
}

/**
 * Processes items in batches of `batchSize` concurrently.
 * Returns results in the same order as the input.
 */
async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    if (signal?.aborted) throw new Error("Aborted");
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Tracking Types ──────────────────────────────────────────────────────────

interface EvaluationTracker {
  contactId: string;
  evaluationFormId: string;
  evaluationId: string;
  latestResult: ContactEvaluation;
  pollFailures: number;
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Starts evaluations for all contact × form pairs with concurrency control,
 * then polls for results every 5 seconds (in batches of 10) until all reach
 * terminal state.
 *
 * Features:
 * - Concurrency-limited starts (5 concurrent) to avoid TooManyRequests
 * - Exponential backoff with jitter on throttling errors during start (up to 5 retries)
 * - Retry on polling failures (up to 3 times per evaluation before marking failed)
 * - Phase change callbacks for UI visibility
 * - Incremental updates via onEvaluationUpdate
 *
 * Respects AbortSignal at each step.
 */
export async function startAndPollEvaluations(
  params: StartAndPollParams
): Promise<ContactEvaluation[]> {
  const {
    instanceId,
    credentials,
    region,
    contacts,
    formId,
    signal,
    onEvaluationUpdate,
    onStartProgress,
    onPhaseChange,
  } = params;

  if (signal?.aborted) throw new Error("Aborted");

  // Build contact × form pairs (single form per contact)
  const pairs: { contactId: string; formId: string }[] = contacts.map(
    (contact) => ({ contactId: contact.contactId, formId })
  );

  const total = pairs.length;

  // Phase 1: Start evaluations with concurrency limit and retry
  onPhaseChange?.("starting");
  const trackers: EvaluationTracker[] = [];
  const failedEvaluations: ContactEvaluation[] = [];
  let startedCount = 0;

  await concurrentProcess(
    pairs,
    START_CONCURRENCY,
    async (pair, _index) => {
      if (signal?.aborted) throw new Error("Aborted");

      let lastError: unknown;

      for (let attempt = 0; attempt <= START_MAX_RETRIES; attempt++) {
        try {
          const evaluationId = await startEvaluation({
            instanceId,
            contactId: pair.contactId,
            evaluationFormId: pair.formId,
            credentials,
            region,
            signal,
          });

          const initialResult: ContactEvaluation = {
            evaluationId,
            contactId: pair.contactId,
            evaluationFormId: pair.formId,
            status: "pending",
          };

          trackers.push({
            contactId: pair.contactId,
            evaluationFormId: pair.formId,
            evaluationId,
            latestResult: initialResult,
            pollFailures: 0,
          });

          onEvaluationUpdate(initialResult);
          startedCount++;
          onStartProgress?.(startedCount, total);
          return;
        } catch (err) {
          lastError = err;

          if (signal?.aborted) throw new Error("Aborted");

          if (isThrottlingError(err) && attempt < START_MAX_RETRIES) {
            // Exponential backoff with jitter: 2s, 4s, 8s, 16s, 32s
            const backoff = jitter(START_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
            await delay(backoff, signal);
            continue;
          }

          // Non-throttling error or retries exhausted
          break;
        }
      }

      // Failed after all retries
      const failedResult: ContactEvaluation = {
        evaluationId: "",
        contactId: pair.contactId,
        evaluationFormId: pair.formId,
        status: "failed",
        error: lastError instanceof Error ? lastError.message : "Failed to start evaluation",
      };

      failedEvaluations.push(failedResult);
      onEvaluationUpdate(failedResult);
      startedCount++;
      onStartProgress?.(startedCount, total);
    },
    signal
  );

  if (signal?.aborted) throw new Error("Aborted");

  // Phase 2: Poll until all trackers reach terminal state
  onPhaseChange?.("polling");
  let pendingTrackers = trackers.filter(
    (t) => !isTerminalStatus(t.latestResult.status)
  );

  while (pendingTrackers.length > 0) {
    if (signal?.aborted) throw new Error("Aborted");

    await delay(POLL_INTERVAL_MS, signal);

    if (signal?.aborted) throw new Error("Aborted");

    // Poll in batches of POLL_BATCH_SIZE
    await batchProcess(
      pendingTrackers,
      POLL_BATCH_SIZE,
      async (tracker) => {
        if (signal?.aborted) throw new Error("Aborted");

        try {
          const result = await describeEvaluation({
            instanceId,
            evaluationId: tracker.evaluationId,
            credentials,
            region,
            signal,
          });

          // Reset failure count on success
          tracker.pollFailures = 0;
          tracker.latestResult = result;
          onEvaluationUpdate(result);
        } catch (err) {
          if (signal?.aborted) throw new Error("Aborted");

          tracker.pollFailures++;

          if (isThrottlingError(err) && tracker.pollFailures <= MAX_POLL_RETRIES) {
            // Keep in pending — will retry on next poll cycle
            return;
          }

          if (tracker.pollFailures > MAX_POLL_RETRIES) {
            // Exhausted retries — mark as failed
            const failedResult: ContactEvaluation = {
              evaluationId: tracker.evaluationId,
              contactId: tracker.contactId,
              evaluationFormId: tracker.evaluationFormId,
              status: "failed",
              error: err instanceof Error ? err.message : "Failed to poll evaluation after retries",
            };
            tracker.latestResult = failedResult;
            onEvaluationUpdate(failedResult);
          }
          // Otherwise (non-throttling, within retry limit) — will retry next cycle
        }
      },
      signal
    );

    // Remove trackers that reached terminal state
    pendingTrackers = pendingTrackers.filter(
      (t) => !isTerminalStatus(t.latestResult.status)
    );
  }

  // Combine all results: completed trackers + initially failed
  onPhaseChange?.("complete");
  const allResults: ContactEvaluation[] = [
    ...trackers.map((t) => t.latestResult),
    ...failedEvaluations,
  ];

  return allResults;
}
