// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { TranscriptSegment, HydrationCallbacks, HydrationStatus, FetchTranscriptResult } from "./types";

/**
 * Configuration for the hydration retry behaviour when contacts are
 * in "awaiting_analysis" state (Contact Lens S3 file not yet available).
 */
export interface HydrationConfig {
  /** Interval between retry attempts in ms (default 15 000). */
  retryIntervalMs: number;
  /** Maximum total duration before failing a contact in ms (default 600 000 = 10 min). */
  maxRetryDurationMs: number;
}

const DEFAULT_CONFIG: HydrationConfig = {
  retryIntervalMs: 15_000,
  maxRetryDurationMs: 600_000,
};

/**
 * Creates a hydration orchestrator that manages concurrent fetching of
 * transcript segments for a set of contacts.
 *
 * - Enforces a concurrency limit (default 5) on simultaneous loading contacts.
 * - Manages state transitions: pending → loading → ready/awaiting_analysis/failed.
 * - When fetchFn returns { status: "awaiting_analysis" }, the contact is re-queued
 *   for retry after `retryIntervalMs`. If the total retry duration exceeds
 *   `maxRetryDurationMs`, the contact transitions to "failed".
 * - Calls callbacks.onStatusChange on every transition.
 * - abort() cancels in-flight requests via AbortController and stops processing.
 */
export function createHydrationOrchestrator(
  entries: { contactId: string; iterationNumber: number }[],
  fetchFn: (contactId: string, signal?: AbortSignal) => Promise<FetchTranscriptResult>,
  callbacks: HydrationCallbacks,
  config?: Partial<HydrationConfig>,
  options?: { concurrency?: number }
): {
  start: () => void;
  retry: (contactId: string) => void;
  abort: () => void;
} {
  const concurrency = options?.concurrency ?? 5;
  const { retryIntervalMs, maxRetryDurationMs } = { ...DEFAULT_CONFIG, ...config };

  // Internal state tracking
  type InternalStatus = HydrationStatus;
  const statusMap = new Map<string, InternalStatus>();
  const queue: string[] = [];
  let activeCount = 0;
  let abortController: AbortController | null = null;
  let aborted = false;

  // Per-contact retry start timestamps — tracks when we first entered awaiting_analysis
  const retryStartMap = new Map<string, number>();

  // Track pending timers so we can clear them on abort
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  // Initialize all entries as pending
  for (const entry of entries) {
    statusMap.set(entry.contactId, "pending");
    queue.push(entry.contactId);
  }

  function transition(
    contactId: string,
    newStatus: InternalStatus,
    segments?: TranscriptSegment[],
    error?: string
  ): void {
    statusMap.set(contactId, newStatus);
    callbacks.onStatusChange(contactId, newStatus, segments, error);
  }

  function processNext(): void {
    if (aborted) return;

    while (activeCount < concurrency && queue.length > 0) {
      const contactId = queue.shift()!;

      // Only process if still pending or awaiting_analysis (could have been aborted)
      const currentStatus = statusMap.get(contactId);
      if (currentStatus !== "pending" && currentStatus !== "awaiting_analysis") {
        continue;
      }

      activeCount++;
      transition(contactId, "loading");

      const signal = abortController?.signal;

      fetchFn(contactId, signal)
        .then((result) => {
          if (aborted) return;
          activeCount--;

          if (result.status === "ready") {
            // Clear retry tracking on success
            retryStartMap.delete(contactId);
            transition(contactId, "ready", result.segments);
            processNext();
          } else if (result.status === "awaiting_analysis") {
            handleAwaitingAnalysis(contactId);
            processNext();
          }
        })
        .catch((err) => {
          if (aborted) return;
          activeCount--;
          retryStartMap.delete(contactId);
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          transition(contactId, "failed", undefined, errorMessage);
          processNext();
        });
    }
  }

  function handleAwaitingAnalysis(contactId: string): void {
    // Record retry start time if this is the first awaiting_analysis for this contact
    if (!retryStartMap.has(contactId)) {
      retryStartMap.set(contactId, Date.now());
    }

    const retryStart = retryStartMap.get(contactId)!;
    const elapsed = Date.now() - retryStart;

    if (elapsed >= maxRetryDurationMs) {
      // Timeout exceeded — fail the contact
      retryStartMap.delete(contactId);
      transition(
        contactId,
        "failed",
        undefined,
        "Contact Lens analysis not available after timeout"
      );
      return;
    }

    // Report awaiting_analysis status
    transition(contactId, "awaiting_analysis");

    // Schedule re-queue after the retry interval
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (aborted) return;
      queue.push(contactId);
      processNext();
    }, retryIntervalMs);

    pendingTimers.add(timer);
  }

  function start(): void {
    if (aborted) return;
    abortController = new AbortController();
    processNext();
  }

  function retry(contactId: string): void {
    if (aborted) return;

    const currentStatus = statusMap.get(contactId);
    if (currentStatus !== "failed") return;

    // Reset retry tracking for manual retries
    retryStartMap.delete(contactId);

    // Transition failed → pending, then re-queue
    transition(contactId, "pending");
    queue.push(contactId);
    processNext();
  }

  function abort(): void {
    aborted = true;
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    // Clear all pending retry timers
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
  }

  return { start, retry, abort };
}
