// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Types for batch test execution. */

import type { ConversationTranscript, TerminationReason, TestScript } from "./script-types";
import type { AWSCredentials } from "../credentials/types";
import type { VoiceTurnTranscript } from "./voice-types";

/** Configuration for a batch run. */
export interface BatchConfig {
  script: TestScript;
  iterationCount: number; // 1–1000
  concurrencyLimit: number; // 1–50
  agentArn: string;
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactFlowId: string;
  useVariations?: boolean; // Enable random utterance sampling from pool (canonical + variations)
  /** Duration (ms) to wait for additional agent messages after the minimum expected responses. Defaults to 3000. */
  settleDurationMs?: number;
}

/** Status of a single iteration. */
export type IterationStatus = "queued" | "running" | "backoff" | "completed" | "failed";

/** Result for a single iteration. */
export interface IterationResult {
  iterationNumber: number; // 1-based
  status: IterationStatus;
  terminationReason?: TerminationReason | "failed";
  transcript?: ConversationTranscript;
  /** Voice turn metrics (latency, duration per turn). */
  voiceTurns?: VoiceTurnTranscript[];
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
  } | null; // null when no iterations produced a transcript
  totalDurationMs: number;
  /** Duration of the audio pre-generation phase (Polly synthesis), if applicable. */
  synthesisDurationMs?: number;
}

/** Callbacks for batch execution events. */
export interface BatchRunnerCallbacks {
  onIterationStart: (iterationNumber: number) => void;
  onIterationComplete: (result: IterationResult) => void;
  onProgressUpdate: (progress: BatchProgress) => void;
  onBatchComplete: (stats: BatchAggregateStats) => void;
  onError: (iterationNumber: number, error: unknown) => void;
  /** Called when a turn completes within an iteration (for live progress). */
  onTurnComplete?: (iterationNumber: number, turnsCompleted: number) => void;
}

/** Real-time progress snapshot. */
export interface BatchProgress {
  completed: number;
  active: number;
  queued: number;
  total: number;
}
