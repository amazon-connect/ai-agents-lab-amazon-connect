// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Span } from "../sessions/types";
import { formatDuration } from "./format-duration";
import { extractModelName } from "./extract-model-name";
import { extractToolName } from "./extract-tool-name";

/**
 * Builds the inline label string for a span bar.
 *
 * - inference: model short name · duration · total tokens
 * - execute_tool: tool name · duration
 * - invoke_agent: agent name · duration
 *
 * Omits any segment that is empty or missing. Segments are joined with " · "
 * (space-middle-dot-space) with no leading, trailing, or consecutive separators.
 */
export function buildInlineLabel(span: Span): string {
  const durationMs = computeDurationMs(span);
  const formattedDuration = formatDuration(durationMs);

  let segments: string[];

  switch (span.spanName) {
    case "inference":
      segments = buildInferenceSegments(span, formattedDuration);
      break;
    case "execute_tool":
      segments = buildExecuteToolSegments(span, formattedDuration);
      break;
    case "invoke_agent":
      segments = buildInvokeAgentSegments(span, formattedDuration);
      break;
    case "escalate_agent":
      segments = buildEscalateAgentSegments(span, formattedDuration);
      break;
    default:
      segments = formattedDuration !== "0ms" ? [formattedDuration] : [];
      break;
  }

  return segments.filter((s) => s.length > 0).join(" · ");
}

function computeDurationMs(span: Span): number | null {
  if (!span.startTimestamp || !span.endTimestamp) {
    return null;
  }

  const start = new Date(span.startTimestamp).getTime();
  const end = new Date(span.endTimestamp).getTime();

  if (isNaN(start) || isNaN(end)) {
    return null;
  }

  return end - start;
}

function buildInferenceSegments(span: Span, formattedDuration: string): string[] {
  const modelName = extractModelName(span.attributes.requestModel);
  const tokens = span.attributes.usageTotalTokens;
  const tokenStr = tokens != null && tokens > 0 ? `${tokens} tokens` : "";

  // "unknown model" is the fallback from extractModelName for missing input;
  // we still include it as a segment since it conveys useful info.
  return [modelName, formattedDuration, tokenStr];
}

function buildExecuteToolSegments(span: Span, formattedDuration: string): string[] {
  const toolName = extractToolName(span.attributes.inputMessages);
  return [toolName, formattedDuration];
}

function buildInvokeAgentSegments(_span: Span, _formattedDuration: string): string[] {
  // No inline label for invoke_agent spans — the left-side label is sufficient
  return [];
}

function buildEscalateAgentSegments(_span: Span, _formattedDuration: string): string[] {
  // No inline label for escalate_agent spans
  return [];
}
