// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Box from "@cloudscape-design/components/box";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { HelpIcon } from "../contextual-help";
import type { Span } from "../sessions/types";
import { buildAgentKVItems } from "./build-kv-items";

export interface AgentDetailProps {
  /** The invoke_agent span to display details for */
  span: Span;
}

/**
 * Renders the detail view for an invoke_agent span.
 * Shows agent identity (name, ID, version, type, use case) and
 * context (instance ARN, contact ID, duration).
 * Displays "-" for absent, null, or empty-string attributes.
 */
export function AgentDetail({ span }: AgentDetailProps) {
  const { identity, context } = buildAgentKVItems(span);

  return (
    <SpaceBetween size="l">
      <SpaceBetween size="xs">
        <Box variant="h3">
          Agent identity{" "}
          <HelpIcon anchorId="agent-identity" pageId="span-detail" fieldName="Agent identity" />
        </Box>
        <KeyValuePairs
          columns={3}
          items={identity.map((item) => ({
            label: item.label,
            value: item.value,
          }))}
        />
      </SpaceBetween>

      <SpaceBetween size="xs">
        <Box variant="h3">
          Agent context{" "}
          <HelpIcon anchorId="agent-context" pageId="span-detail" fieldName="Agent context" />
        </Box>
        <KeyValuePairs
          columns={3}
          items={context.map((item) => ({
            label: item.label,
            value: item.value,
          }))}
        />
      </SpaceBetween>
    </SpaceBetween>
  );
}
