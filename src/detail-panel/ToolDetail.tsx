// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Box from "@cloudscape-design/components/box";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { HelpIcon } from "../contextual-help";
import type { Span } from "../sessions/types";
import { extractToolInfo } from "./extract-tool-info";
import { computeSpanDuration } from "./compute-span-duration";
import { buildToolKVItems } from "./build-kv-items";
import { CodeDisplay } from "./CodeDisplay";

export interface ToolDetailProps {
  span: Span;
}

/**
 * Renders detail content for an execute_tool span.
 *
 * Displays:
 * 1. Tool info KeyValuePairs (tool name, tool use ID, duration)
 * 2. Arguments CodeDisplay (formatted JSON, if toolUse present and has arguments)
 * 3. Result CodeDisplay (formatted JSON, if toolResult present in outputMessages)
 */
export function ToolDetail({ span }: ToolDetailProps) {
  const toolInfo = extractToolInfo(span.attributes.inputMessages);
  const durationMs = computeSpanDuration(span.startTimestamp, span.endTimestamp);
  const { toolInfoItems } = buildToolKVItems(span, toolInfo, durationMs);

  // Extract tool result from outputMessages
  const toolResultContent = extractToolResult(span);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <SpaceBetween size="xs">
        <Box variant="h3">
          Tool info{" "}
          <HelpIcon anchorId="tool-info" pageId="span-detail" fieldName="Tool info" />
        </Box>
        <KeyValuePairs
          columns={3}
          items={toolInfoItems.map((item) => ({
            label: item.label,
            value: item.value,
          }))}
        />
      </SpaceBetween>

      {toolInfo.arguments !== undefined && (
        <div>
          <h3>Arguments</h3>
          <CodeDisplay content={toolInfo.arguments} />
        </div>
      )}

      {toolResultContent !== undefined && (
        <div>
          <h3>Tool Result</h3>
          <CodeDisplay content={toolResultContent} />
        </div>
      )}
    </div>
  );
}

/**
 * Extracts the first toolResult text content from a span's outputMessages.
 * Joins all text values from the toolResult entry.
 * Returns undefined if no toolResult is found.
 */
function extractToolResult(span: Span): string | undefined {
  const outputMessages = span.attributes.outputMessages;
  if (!outputMessages || outputMessages.length === 0) {
    return undefined;
  }

  for (const message of outputMessages) {
    for (const value of message.values) {
      if ("toolResult" in value) {
        const texts = value.toolResult.values.map((v) => v.text.value);
        return texts.join("\n");
      }
    }
  }

  return undefined;
}
