// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Box from "@cloudscape-design/components/box";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { HelpIcon } from "../contextual-help";
import type { Span } from "../sessions/types";
import { buildInferenceKVItems } from "./build-kv-items";
import { MessageList } from "./MessageList";
import { SystemPromptSection } from "./SystemPromptSection";

export interface InferenceDetailProps {
  /** The inference span to display details for */
  span: Span;
  /** Contact channel (e.g. "CHAT", "VOICE") */
  channel?: string;
}

/**
 * Renders the detail view for an inference span.
 * Shows model configuration, token usage, messages, system prompt,
 * and prompt metadata. Sections are hidden when data is absent/null/empty.
 */
export function InferenceDetail({ span, channel }: InferenceDetailProps) {
  const { modelConfig, tokenUsage, promptMetadata } =
    buildInferenceKVItems(span);

  const attrs = span.attributes;

  const hasInputMessages =
    attrs.inputMessages != null && attrs.inputMessages.length > 0;
  const hasOutputMessages =
    attrs.outputMessages != null && attrs.outputMessages.length > 0;
  const hasSystemInstructions =
    attrs.systemInstructions != null && attrs.systemInstructions.length > 0;

  return (
    <SpaceBetween size="l">
      <SpaceBetween size="xs">
        <Box variant="h3" padding={{ bottom: "xxs" }}>
          Model configuration{" "}
          <HelpIcon anchorId="model-config" pageId="span-detail" fieldName="Model configuration" />
        </Box>
        <KeyValuePairs
          columns={3}
          items={modelConfig.map((item) => ({
            label: item.label,
            value: item.value,
          }))}
        />
      </SpaceBetween>

      <SpaceBetween size="xs">
        <Box variant="h3" padding={{ bottom: "xxs" }}>
          Token usage{" "}
          <HelpIcon anchorId="token-usage" pageId="span-detail" fieldName="Token usage" />
        </Box>
        <KeyValuePairs
          columns={3}
          items={tokenUsage.map((item) => ({
            label: item.label,
            value: item.value,
          }))}
        />
      </SpaceBetween>

      {promptMetadata && (
        <SpaceBetween size="xs">
          <Box variant="h3" padding={{ bottom: "xxs" }}>
            Prompt metadata{" "}
            <HelpIcon anchorId="prompt-metadata" pageId="span-detail" fieldName="Prompt metadata" />
          </Box>
          <KeyValuePairs
            columns={3}
            items={promptMetadata.map((item) => ({
              label: item.label,
              value: item.value,
            }))}
          />
        </SpaceBetween>
      )}

      {hasInputMessages && (
        <MessageList
          messages={attrs.inputMessages!}
          heading="Input messages"
          markFirstAsCumulative={channel === "CHAT"}
        />
      )}

      {hasOutputMessages && (
        <MessageList
          messages={attrs.outputMessages!}
          heading="Output messages"
        />
      )}

      {hasSystemInstructions && (
        <SystemPromptSection instructions={attrs.systemInstructions!} />
      )}
    </SpaceBetween>
  );
}
