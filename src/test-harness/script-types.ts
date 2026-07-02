// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AWSCredentials } from "../credentials/types";
import type { ChatMessage } from "./chat-client";

/** A parsed test script ready for execution. */
export interface TestScript {
  name: string; // 1–200 characters
  turns: ScriptTurn[]; // 1–50 entries
}

/** A single turn in a test script. */
export interface ScriptTurn {
  customer: string; // 1–1024 characters, non-whitespace-only
  expectedResponses?: number; // Number of agent messages to wait for (default: 1)
  variations?: string[]; // Optional alternative phrasings; 1–50 items, each 1–1024 chars
}

/** Result of parsing YAML — either success or failure. */
export type ParseResult =
  | { ok: true; script: TestScript }
  | { ok: false; error: ParseError };

/** Structured parse/validation error. */
export interface ParseError {
  type: "syntax" | "validation";
  message: string;
  line?: number; // Present for syntax errors
  turnIndex?: number; // Present for turn-level validation errors
}

/** Reason a script execution terminated. */
export type TerminationReason =
  | "completed"
  | "exit_branch"
  | "max_timeout"
  | "user_stopped";

/** Record of a single completed turn. */
export interface TurnTranscript {
  turnIndex: number;
  customerUtterance: string;
  agentResponse: string;
  /** Individual agent messages for this turn (preserves message boundaries). */
  agentResponses: string[];
  sendTimestamp: string; // ISO 8601 UTC, millisecond precision
  receiveTimestamp: string; // ISO 8601 UTC, millisecond precision
  latencyMs: number; // time to first response (kept for backward compat)
  /** Per-response latencies within this turn (ms). First entry = time to first response, subsequent = inter-message gaps. */
  responseLatencies?: number[];
}

/** Complete transcript of a script execution. */
export interface ConversationTranscript {
  scriptName: string;
  agentArn: string;
  terminationReason: TerminationReason;
  totalDurationMs: number;
  turnsCompleted: number;
  turnsTotal: number;
  stoppedAtIndex?: number; // Present when terminated early
  turns: TurnTranscript[];
}

/** Progress update emitted during execution. */
export interface ScriptProgress {
  currentTurn: number; // 1-based for display
  totalTurns: number;
  state: "running" | "waiting_for_response";
}

/** Parameters for starting script execution. */
export interface RunScriptParams {
  script: TestScript;
  agentArn: string;
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactFlowId: string;
  useVariations?: boolean; // Enable random sampling from pool (canonical + variations)
  /** Duration (ms) to wait for additional agent messages after the minimum expected responses. Defaults to 3000. */
  settleDurationMs?: number;
}

/** Callbacks for Script Runner events. */
export interface ScriptRunnerCallbacks {
  onProgress: (progress: ScriptProgress) => void;
  onTurnComplete: (turn: TurnTranscript) => void;
  onMessage: (message: ChatMessage) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onSessionStart: (contactId: string) => void;
  onComplete: (transcript: ConversationTranscript) => void;
  onError: (error: string) => void;
}
