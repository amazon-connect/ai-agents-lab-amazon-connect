// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import SplitPanel from "@cloudscape-design/components/split-panel";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import type { Span } from "../sessions/types";
import { computeSpanDuration } from "./compute-span-duration";
import { formatDuration } from "../waterfall/format-duration";
import { formatSpanName } from "../waterfall/format-span-name";
import { InferenceDetail } from "./InferenceDetail";
import { ToolDetail } from "./ToolDetail";
import { AgentDetail } from "./AgentDetail";

export interface SpanDetailPanelProps {
  /** The currently selected span, or undefined if no selection */
  selectedSpan: Span | undefined;
  /** Contact channel (e.g. "CHAT", "VOICE") — used to control cumulative transcript display */
  channel?: string;
}

/**
 * Wraps span detail content in a Cloudscape SplitPanel.
 * Dispatches to type-specific detail components based on span.spanName.
 * Returns null when no span is selected (parent AppLayout handles visibility).
 *
 * Note: Panel close/dismiss is handled by the parent AppLayout's
 * onSplitPanelToggle callback, not by this component directly.
 */
export function SpanDetailPanel({ selectedSpan, channel }: SpanDetailPanelProps) {
  if (!selectedSpan) {
    return null;
  }

  const header = formatSpanName(selectedSpan.spanName);

  return (
    <SplitPanel
      header={header}
      closeBehavior="hide"
      i18nStrings={{
        preferencesTitle: "Split panel preferences",
        preferencesPositionLabel: "Position",
        preferencesPositionDescription: "Choose where the panel appears relative to the content.",
        preferencesPositionSide: "Side",
        preferencesPositionBottom: "Bottom",
        preferencesConfirm: "Confirm",
        preferencesCancel: "Cancel",
        closeButtonAriaLabel: "Close panel",
        openButtonAriaLabel: "Open panel",
        resizeHandleAriaLabel: "Resize panel",
      }}
    >
      <div style={{ paddingBottom: "24px" }}>
        <SpanDetailContent span={selectedSpan} channel={channel} />
      </div>
    </SplitPanel>
  );
}

interface SpanDetailContentProps {
  span: Span;
  channel?: string;
}

/**
 * Dispatches to the appropriate type-specific detail component
 * based on span.spanName, or renders a generic fallback.
 */
function SpanDetailContent({ span, channel }: SpanDetailContentProps) {
  switch (span.spanName) {
    case "inference":
      return <InferenceDetail span={span} channel={channel} />;
    case "execute_tool":
      return <ToolDetail span={span} />;
    case "invoke_agent":
      return <AgentDetail span={span} />;
    default:
      return <GenericSpanDetail span={span} />;
  }
}

/**
 * Generic fallback view for unknown span types.
 * Displays spanId, status, timestamps, and duration.
 */
function GenericSpanDetail({ span }: SpanDetailContentProps) {
  const durationMs = computeSpanDuration(span.startTimestamp, span.endTimestamp);
  const durationDisplay = formatDuration(durationMs);

  const items = [
    { label: "Span ID", value: span.spanId },
    { label: "Status", value: span.status },
    { label: "Start time", value: span.startTimestamp },
    { label: "End time", value: span.endTimestamp },
    { label: "Duration", value: durationDisplay },
  ];

  return (
    <KeyValuePairs
      columns={3}
      items={items.map((item) => ({
        label: item.label,
        value: item.value,
      }))}
    />
  );
}
