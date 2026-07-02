// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Span } from "../sessions/types";
import type { ToolInfo } from "./extract-tool-info";
import type { DurationResult } from "./compute-span-duration";
import { computeSpanDuration } from "./compute-span-duration";
import { formatDuration } from "../waterfall/format-duration";

export interface KVItem {
  label: string;
  value: string;
}

const DASH = "-";

/**
 * Returns DASH for null, undefined, or empty-string values.
 * Converts numbers to string. Passes non-empty strings through.
 */
function display(val: string | number | undefined | null): string {
  if (val === null || val === undefined || val === "") return DASH;
  return String(val);
}

/**
 * Builds KV item groups for an inference span.
 */
export function buildInferenceKVItems(span: Span): {
  modelConfig: KVItem[];
  tokenUsage: KVItem[];
  promptMetadata: KVItem[] | null;
} {
  const attrs = span.attributes;

  // TTFT: append "ms" suffix if present
  const ttftValue =
    attrs.timeToFirstTokenMs != null ? `${attrs.timeToFirstTokenMs}ms` : DASH;

  // Finish reason: first element of array or dash
  const finishReason =
    attrs.responseFinishReasons && attrs.responseFinishReasons.length > 0
      ? attrs.responseFinishReasons[0]
      : DASH;

  const modelConfig: KVItem[] = [
    { label: "Model ID", value: display(attrs.requestModel) },
    { label: "Time to first token", value: ttftValue },
    { label: "Temperature", value: display(attrs.temperature) },
    { label: "Max tokens", value: display(attrs.requestMaxTokens) },
    { label: "Finish reason", value: display(finishReason) },
  ];

  const tokenUsage: KVItem[] = [
    { label: "Input tokens", value: display(attrs.usageInputTokens) },
    { label: "Output tokens", value: display(attrs.usageOutputTokens) },
    { label: "Total tokens", value: display(attrs.usageTotalTokens) },
    { label: "Cache read tokens", value: display(attrs.cacheReadInputTokens) },
    {
      label: "Cache write tokens",
      value: display(attrs.cacheWriteInputTokens),
    },
  ];

  // Prompt metadata: only when promptName or promptVersion is present
  const hasPromptMetadata =
    attrs.promptName != null &&
    attrs.promptName !== "" ||
    attrs.promptVersion != null &&
    attrs.promptVersion !== "";

  const promptMetadata: KVItem[] | null = hasPromptMetadata
    ? [
        { label: "Prompt name", value: display(attrs.promptName) },
        { label: "Prompt version", value: display(attrs.promptVersion) },
        { label: "Prompt ARN", value: display(attrs.promptArn) },
      ]
    : null;

  return { modelConfig, tokenUsage, promptMetadata };
}

/**
 * Builds KV item groups for an invoke_agent span.
 */
export function buildAgentKVItems(span: Span): {
  identity: KVItem[];
  context: KVItem[];
} {
  const attrs = span.attributes;

  const identity: KVItem[] = [
    { label: "Agent name", value: display(attrs.aiAgentName) },
    { label: "Agent ID", value: display(attrs.aiAgentId) },
    { label: "Agent version", value: display(attrs.aiAgentVersion) },
    { label: "Agent type", value: display(attrs.aiAgentType) },
    {
      label: "Use case",
      value: display(attrs.aiAgentOrchestratorUseCase),
    },
  ];

  const durationMs = computeSpanDuration(
    span.startTimestamp,
    span.endTimestamp
  );
  const durationDisplay = formatDuration(durationMs);

  const context: KVItem[] = [
    { label: "Instance ARN", value: display(attrs.instanceArn) },
    { label: "Contact ID", value: display(attrs.contactId) },
    { label: "Duration", value: durationDisplay },
  ];

  return { identity, context };
}

/**
 * Builds KV item groups for an execute_tool span.
 */
export function buildToolKVItems(
  _span: Span,
  toolInfo: ToolInfo,
  durationMs: DurationResult
): {
  toolInfoItems: KVItem[];
} {
  const durationDisplay = formatDuration(durationMs);

  const toolInfoItems: KVItem[] = [
    { label: "Tool name", value: display(toolInfo.toolName) },
    { label: "Tool use ID", value: display(toolInfo.toolUseId) },
    { label: "Duration", value: durationDisplay },
  ];

  return { toolInfoItems };
}
