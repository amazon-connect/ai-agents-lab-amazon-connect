// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AiAgentInfo } from "../contacts/contacts-client";

export type { AiAgentInfo };

export interface Span {
  spanId: string;
  parentSpanId?: string;
  spanName: "invoke_agent" | "inference" | "execute_tool" | "escalate_agent" | (string & {});
  spanType: "SERVER" | "CLIENT";
  startTimestamp: string; // ISO 8601
  endTimestamp: string; // ISO 8601
  status: string;
  requestId?: string;
  originRequestId: string;
  attributes: SpanAttributes;
}

export interface SpanAttributes {
  // Common
  operationName?: string;
  providerName?: string;
  instanceArn?: string;
  contactId?: string;
  initialContactId?: string;
  sessionName?: string;
  aiAgentArn?: string;
  aiAgentType?: string;
  aiAgentName?: string;
  aiAgentId?: string;
  aiAgentVersion?: string;
  aiAgentOrchestratorUseCase?: string;

  // Inference-specific
  requestModel?: string;
  requestMaxTokens?: number;
  temperature?: number;
  responseFinishReasons?: string[];
  usageInputTokens?: number;
  usageOutputTokens?: number;
  usageTotalTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  timeToFirstTokenMs?: number;
  inputMessages?: Message[];
  outputMessages?: Message[];
  systemInstructions?: Array<{ text: { value: string } }>;
  promptArn?: string;
  promptId?: string;
  promptType?: string;
  promptName?: string;
  promptVersion?: string;
}

export interface Message {
  messageId: string;
  participant: "CUSTOMER" | "BOT";
  timestamp: string;
  values: MessageValue[];
}

export type MessageValue =
  | { text: { value: string } }
  | { toolUse: { toolUseId: string; name: string; arguments: string } }
  | { toolResult: { toolUseId: string; values: Array<{ text: { value: string } }> } };

export interface SpanNode {
  span: Span;
  children: SpanNode[];
}

export interface SpanTree {
  roots: SpanNode[];
  totalCount: number;
}

export interface SessionMetadata {
  contactId: string;
  sessionId: string;
  assistantId: string;
  aiAgents: AiAgentInfo[];
  totalSpans: number;
  rootSpanCount: number;
  channel?: string;
}

export interface SessionNavigationState {
  sessionArn: string;
  aiAgents?: AiAgentInfo[];
  channel?: string;
}

export interface ParsedSessionArn {
  partition: string;
  region: string;
  account: string;
  assistantId: string;
  sessionId: string;
}

export type ArnParseError =
  | { type: "missing_input" }
  | { type: "invalid_format"; detail: string };

export type ArnParseResult =
  | { ok: true; value: ParsedSessionArn }
  | { ok: false; error: ArnParseError };

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; tree: SpanTree; metadata: SessionMetadata }
  | { status: "empty" }
  | { status: "no-session"; contactId: string }
  | { status: "error"; message: string; retryable: boolean };
