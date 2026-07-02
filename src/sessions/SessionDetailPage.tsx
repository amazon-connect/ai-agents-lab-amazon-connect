// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useMemo } from "react";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Multiselect from "@cloudscape-design/components/multiselect";
import type { MultiselectProps } from "@cloudscape-design/components/multiselect";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";

import { SpanWaterfall } from "../waterfall";
import { useSessionResolver } from "./session-resolver";
import type { Span, SpanNode, SpanTree, SessionMetadata } from "./types";
import { SpanDetailPanel } from "../detail-panel/SpanDetailPanel";
import { usePanelPreferences } from "../detail-panel/panel-preferences";
import { useSplitPanelControl } from "../layouts/SplitPanelContext";

/**
 * Recursively searches the span tree for a span with the given spanId.
 */
function findSpanById(tree: SpanTree, spanId: string): Span | undefined {
  function searchNodes(nodes: SpanNode[]): Span | undefined {
    for (const node of nodes) {
      if (node.span.spanId === spanId) {
        return node.span;
      }
      const found = searchNodes(node.children);
      if (found) return found;
    }
    return undefined;
  }
  return searchNodes(tree.roots);
}

/**
 * Extracts unique agent names from all spans in the tree.
 */
function extractAgentNames(tree: SpanTree): string[] {
  const names = new Set<string>();
  function walk(nodes: SpanNode[]) {
    for (const node of nodes) {
      const name = node.span.attributes.aiAgentName;
      if (name) names.add(name);
      walk(node.children);
    }
  }
  walk(tree.roots);
  return Array.from(names).sort();
}

/**
 * Filters a span tree to only include spans belonging to the selected agents.
 * A span matches if its aiAgentName is in the set, or if it has no agent name
 * (child spans like inference/execute_tool inherit from parent).
 */
function filterTreeByAgents(tree: SpanTree, selectedAgents: Set<string>): SpanTree {
  function filterNodes(nodes: SpanNode[]): SpanNode[] {
    const result: SpanNode[] = [];
    for (const node of nodes) {
      const agentName = node.span.attributes.aiAgentName;
      // Include if agent matches or if no agent name (inherits from parent context)
      if (!agentName || selectedAgents.has(agentName)) {
        const filteredChildren = filterNodes(node.children);
        result.push({ span: node.span, children: filteredChildren });
      }
    }
    return result;
  }

  const filteredRoots = filterNodes(tree.roots);
  let count = 0;
  function countNodes(nodes: SpanNode[]) {
    for (const node of nodes) {
      count++;
      countNodes(node.children);
    }
  }
  countNodes(filteredRoots);

  return { roots: filteredRoots, totalCount: count };
}

/**
 * Renders the metadata header section showing session and contact information.
 */
function MetadataHeader({ metadata }: { metadata: SessionMetadata }) {
  const agentSummary =
    metadata.aiAgents.length > 0
      ? metadata.aiAgents
          .map(
            (agent) =>
              `${agent.aiUseCase}${agent.aiAgentEscalated ? " (escalated)" : ""}`
          )
          .join(", ")
      : "—";

  return (
    <Container header={<Header variant="h2">Session metadata</Header>}>
      <KeyValuePairs
        columns={3}
        items={[
          {
            label: "Contact ID",
            value: metadata.contactId || "—",
          },
          {
            label: "Session ID",
            value: metadata.sessionId || "—",
          },
          {
            label: "Assistant ID",
            value: metadata.assistantId || "—",
          },
          {
            label: "AI agent",
            value: agentSummary,
          },
          {
            label: "Total spans",
            value: String(metadata.totalSpans),
          },
          {
            label: "Root spans (turns)",
            value: String(metadata.rootSpanCount),
          },
        ]}
      />
    </Container>
  );
}

/**
 * Session detail page that displays session metadata and span data.
 * Uses the useSessionResolver hook to drive page state through loading,
 * error, empty, no-session, and ready states.
 *
 * Renders the SpanWaterfall component when session data is ready,
 * with controlled selection state for the detail panel integration.
 * The split panel is registered with the AppShell via SplitPanelContext.
 */
export default function SessionDetailPage() {
  const state = useSessionResolver();
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>(undefined);
  const [selectedAgentOptions, setSelectedAgentOptions] = useState<MultiselectProps.Option[]>([]);
  const { position, setPosition } = usePanelPreferences();
  const { setConfig } = useSplitPanelControl();

  // Extract unique agent names from the tree
  const agentNames = useMemo(() => {
    if (state.status !== "ready") return [];
    return extractAgentNames(state.tree);
  }, [state]);

  // Build multiselect options from agent names
  const agentOptions: MultiselectProps.Option[] = useMemo(
    () => agentNames.map((name) => ({ label: name, value: name })),
    [agentNames]
  );

  // Initialize selection to all agents when tree loads
  useEffect(() => {
    if (agentOptions.length > 0 && selectedAgentOptions.length === 0) {
      setSelectedAgentOptions(agentOptions);
    }
  }, [agentOptions]);

  // Compute filtered tree based on selected agents
  const filteredTree = useMemo(() => {
    if (state.status !== "ready") return null;
    if (selectedAgentOptions.length === 0 || selectedAgentOptions.length === agentNames.length) {
      return state.tree; // No filtering needed
    }
    const selectedSet = new Set(selectedAgentOptions.map((o) => o.value!));
    return filterTreeByAgents(state.tree, selectedSet);
  }, [state, selectedAgentOptions, agentNames]);

  const handleSpanSelect = (span: Span) => {
    setSelectedSpanId(span.spanId);
  };

  const handleSpanDeselect = () => {
    setSelectedSpanId(undefined);
  };

  // Register/unregister split panel config with AppShell
  useEffect(() => {
    if (state.status !== "ready" || !selectedSpanId) {
      setConfig(null);
      return;
    }

    const span = findSpanById(state.tree, selectedSpanId);
    if (!span) {
      setConfig(null);
      return;
    }

    setConfig({
      panel: <SpanDetailPanel selectedSpan={span} channel={state.metadata.channel} />,
      open: true,
      preferences: { position },
      onPreferencesChange: (detail) => setPosition(detail.position as "bottom" | "side"),
      onToggle: (open) => {
        if (!open) {
          setSelectedSpanId(undefined);
        }
      },
    });

    return () => {
      setConfig(null);
    };
  }, [selectedSpanId, state, position, setPosition, setConfig]);

  if (state.status === "loading") {
    return (
      <ContentLayout header={<Header variant="h1">Session detail</Header>}>
        <Box textAlign="center" padding={{ top: "xxl" }}>
          <Spinner size="large" />
          <Box variant="p" padding={{ top: "s" }} color="text-body-secondary">
            Resolving session and loading spans…
          </Box>
        </Box>
      </ContentLayout>
    );
  }

  if (state.status === "error") {
    return (
      <ContentLayout header={<Header variant="h1">Session detail</Header>}>
        <Alert
          type="error"
          header="Error loading session"
          action={
            state.retryable ? (
              <Button onClick={() => window.location.reload()}>Retry</Button>
            ) : undefined
          }
        >
          {state.message}
        </Alert>
      </ContentLayout>
    );
  }

  if (state.status === "no-session") {
    return (
      <ContentLayout header={<Header variant="h1">Session detail</Header>}>
        <Alert type="info" header="No AI agent session">
          Contact <strong>{state.contactId}</strong> does not have an associated
          AI agent session. Only contacts handled by Amazon Connect AI Agents AI agents have
          execution traces.
        </Alert>
      </ContentLayout>
    );
  }

  if (state.status === "empty") {
    return (
      <ContentLayout header={<Header variant="h1">Session detail</Header>}>
        <Alert type="info" header="No spans found">
          The session exists but no execution spans were found. The AI agent may
          not have produced any trace data for this interaction.
        </Alert>
      </ContentLayout>
    );
  }

  // status === "ready"
  return (
    <ContentLayout header={<Header variant="h1">Session detail</Header>}>
      <SpaceBetween size="l">
        <MetadataHeader metadata={state.metadata} />

        <Container header={<Header variant="h2">Span waterfall</Header>}>
          {agentNames.length > 1 && (
            <div style={{ marginBottom: "12px" }}>
              <Multiselect
                selectedOptions={selectedAgentOptions}
                onChange={({ detail }) =>
                  setSelectedAgentOptions(detail.selectedOptions as MultiselectProps.Option[])
                }
                options={agentOptions}
                placeholder="Filter by agent"
                tokenLimit={3}
              />
            </div>
          )}
          <SpanWaterfall
            tree={filteredTree ?? state.tree}
            sessionId={state.metadata.sessionId}
            selectedSpanId={selectedSpanId}
            onSpanSelect={handleSpanSelect}
            onSpanDeselect={handleSpanDeselect}
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
