// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Export utilities for batch test execution results. */

import type {
  ConversationTranscript,
  TerminationReason,
} from "./script-types";

/** Status of a single iteration. */
export type IterationStatus =
  | "queued"
  | "running"
  | "backoff"
  | "completed"
  | "failed";

/** Result for a single iteration. */
export interface IterationResult {
  iterationNumber: number;
  status: IterationStatus;
  terminationReason?: TerminationReason | "failed";
  transcript?: ConversationTranscript;
  errorMessage?: string;
  durationMs: number;
  contactId?: string;
  turnsCompleted: number;
  turnsTotal: number;
  retryCount: number;
}

/** Aggregate statistics emitted on batch completion. */
export interface BatchAggregateStats {
  counts: Record<TerminationReason | "failed", number>;
  latency: {
    average: number;
    p50: number;
    p95: number;
  } | null;
  totalDurationMs: number;
}

/** In-memory batch result state. */
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

/** Payload structure for JSON export. */
export interface ExportPayload {
  batchConfig: {
    iterationCount: number;
    concurrencyLimit: number;
  };
  aggregateStats: BatchAggregateStats;
  iterations: IterationResult[];
}

/**
 * Generate the export filename from script name and batch start timestamp.
 *
 * Pattern: `batch-{sanitized-name}-{YYYYMMDDTHHmmssZ}.json`
 * - Non-alphanumeric characters (except hyphens) are replaced by hyphens
 * - Consecutive hyphens are collapsed to a single hyphen
 * - Leading/trailing hyphens are removed
 * - Name is truncated to a maximum of 50 characters
 * - Timestamp is formatted as YYYYMMDDTHHmmssZ in UTC
 */
export function generateExportFilename(
  scriptName: string,
  startTimestamp: string
): string {
  const sanitized = sanitizeScriptName(scriptName);
  const formattedTimestamp = formatTimestamp(startTimestamp);
  return `batch-${sanitized}-${formattedTimestamp}.json`;
}

/**
 * Build the export payload from the current batch result state.
 * Extracts batchConfig, aggregateStats, and iterations.
 */
export function buildExportPayload(state: BatchResultState): ExportPayload {
  const defaultStats: BatchAggregateStats = {
    counts: {
      completed: 0,
      exit_branch: 0,
      max_timeout: 0,
      user_stopped: 0,
      failed: 0,
    },
    latency: null,
    totalDurationMs: 0,
  };

  return {
    batchConfig: {
      iterationCount: state.iterationCount,
      concurrencyLimit: state.concurrencyLimit,
    },
    aggregateStats: state.aggregateStats ?? defaultStats,
    iterations: state.iterations,
  };
}

/**
 * Trigger a browser file download of the payload as JSON.
 * Creates a temporary Blob URL and programmatically clicks a download link.
 */
export function downloadJson(payload: ExportPayload, filename: string): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up after a short delay to ensure download starts
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

/** Sanitize script name: replace non-alphanumeric (except hyphens) with hyphens, collapse, trim, truncate to 50 chars. */
function sanitizeScriptName(name: string): string {
  let sanitized = name
    .replace(/[^a-zA-Z0-9-]/g, "-") // Replace non-alphanumeric (except hyphens) with hyphens
    .replace(/-+/g, "-") // Collapse consecutive hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

  // Truncate to 50 characters, avoiding a trailing hyphen after truncation
  if (sanitized.length > 50) {
    sanitized = sanitized.slice(0, 50).replace(/-$/, "");
  }

  return sanitized;
}

/** Format an ISO 8601 timestamp as YYYYMMDDTHHmmssZ. */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}
