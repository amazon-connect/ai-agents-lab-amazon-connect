// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import type { TableProps } from "@cloudscape-design/components/table";

import type { IterationResult } from "../test-harness/batch-types";
import type { TurnTranscript } from "../test-harness/script-types";
import type { VoiceTurnTranscript } from "../test-harness/voice-types";

export interface TranscriptDetailProps {
  /** The iteration result containing the transcript to display */
  result: IterationResult;
  /** Callback to close the panel */
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MetricsRow {
  rowKey: string;
  turnNumber: number;
  responseNumber?: number;
  customerUtterance: string;
  latencyMs: number;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function computePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function computeStats(latencies: number[]) {
  if (latencies.length === 0) return { average: 0, p50: 0, p95: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    average: sum / sorted.length,
    p50: computePercentile(sorted, 50),
    p95: computePercentile(sorted, 95),
  };
}

// ─── Column Definitions ──────────────────────────────────────────────────────

const METRICS_COLUMNS: TableProps.ColumnDefinition<MetricsRow>[] = [
  {
    id: "turnNumber",
    header: "Turn",
    cell: (item) => item.responseNumber
      ? `${item.turnNumber}.${item.responseNumber}`
      : item.turnNumber,
    width: 60,
  },
  {
    id: "customerUtterance",
    header: "Customer utterance",
    cell: (item) => truncate(item.customerUtterance, 40),
    width: 200,
  },
  {
    id: "latencyMs",
    header: "Latency (ms)",
    cell: (item) => Math.round(item.latencyMs),
    width: 100,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Slide-out panel showing metrics and transcript for a single batch iteration.
 * Metrics (per-turn latency table + stats) are shown at the top.
 * The full conversation transcript is in a collapsed expandable section below.
 */
export default function TranscriptDetail({ result, onClose }: TranscriptDetailProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const transcript = result.transcript;
  const contactId = result.contactId ?? "N/A";
  const terminationReason = result.terminationReason ?? "N/A";
  const turnsLabel = `${result.turnsCompleted}/${result.turnsTotal} turns`;

  // Build metrics rows from transcript turns (chat) or voiceTurns (voice)
  const metricsRows: MetricsRow[] = useMemo(() => {
    // Voice path
    if (result.voiceTurns && result.voiceTurns.length > 0) {
      return result.voiceTurns.map((turn: VoiceTurnTranscript) => ({
        rowKey: `turn-${turn.turnIndex}`,
        turnNumber: turn.turnIndex + 1,
        customerUtterance: turn.customerUtterance,
        latencyMs: turn.latencyMs,
      }));
    }
    // Chat path
    if (!transcript || transcript.turns.length === 0) return [];
    const rows: MetricsRow[] = [];
    for (const turn of transcript.turns) {
      if (turn.responseLatencies && turn.responseLatencies.length > 1) {
        for (let i = 0; i < turn.responseLatencies.length; i++) {
          rows.push({
            rowKey: `turn-${turn.turnIndex}-resp-${i}`,
            turnNumber: turn.turnIndex + 1,
            responseNumber: i + 1,
            customerUtterance: i === 0 ? turn.customerUtterance : "",
            latencyMs: turn.responseLatencies[i]!,
          });
        }
      } else {
        rows.push({
          rowKey: `turn-${turn.turnIndex}`,
          turnNumber: turn.turnIndex + 1,
          customerUtterance: turn.customerUtterance,
          latencyMs: turn.responseLatencies?.[0] ?? turn.latencyMs,
        });
      }
    }
    return rows;
  }, [transcript, result.voiceTurns]);

  // Compute aggregate stats (skip turn 1 which includes connection overhead)
  const stats = useMemo(() => {
    const latencies = metricsRows
      .filter((row) => row.turnNumber > 1)
      .map((row) => row.latencyMs);
    return computeStats(latencies);
  }, [metricsRows]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "480px",
        height: "100vh",
        backgroundColor: "#ffffff",
        borderLeft: "1px solid #e9ebed",
        boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.1)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Open Sans', 'Helvetica Neue', Roboto, Arial, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e9ebed",
          flexShrink: 0,
        }}
      >
        <Header
          variant="h2"
          actions={
            <Button
              variant="icon"
              iconName="close"
              ariaLabel="Close detail panel"
              onClick={onClose}
            />
          }
        >
          Iteration #{result.iterationNumber}
        </Header>
        <div style={{ marginTop: "8px" }}>
          <SpaceBetween size="xxs">
            <Box variant="small" color="text-body-secondary">
              Contact: {contactId}
            </Box>
            <Box variant="small" color="text-body-secondary">
              Reason: {terminationReason} · {turnsLabel}
            </Box>
          </SpaceBetween>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
        }}
      >
        <SpaceBetween size="l">
          {/* Metrics section */}
          {metricsRows.length > 0 ? (
            <>
              {/* Aggregate stats */}
              <KeyValuePairs
                columns={3}
                items={[
                  { label: "Avg", value: `${Math.round(stats.average)}ms` },
                  { label: "p50", value: `${Math.round(stats.p50)}ms` },
                  { label: "p95", value: `${Math.round(stats.p95)}ms` },
                ]}
              />

              {/* Per-turn latency table */}
              <Table
                items={metricsRows}
                columnDefinitions={METRICS_COLUMNS}
                variant="embedded"
                stripedRows
                trackBy="rowKey"
                header={
                  <Header variant="h3" counter={`(${metricsRows.length})`}>
                    Per-turn latency
                  </Header>
                }
              />
            </>
          ) : (
            <Box variant="p" color="text-body-secondary" textAlign="center">
              No metrics available for this iteration.
            </Box>
          )}

          {/* Transcript section — collapsed by default (chat only) */}
          {transcript && transcript.turns.length > 0 && (
            <ExpandableSection
              headerText="Conversation transcript"
              defaultExpanded={false}
            >
              <SpaceBetween size="m">
                {transcript.turns.map((turn: TurnTranscript) => (
                  <TurnBubbles key={turn.turnIndex} turn={turn} />
                ))}
              </SpaceBetween>
            </ExpandableSection>
          )}
        </SpaceBetween>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface TurnBubblesProps {
  turn: TurnTranscript;
}

/** Renders a single turn: customer message (right) then agent response(s) (left) with latency. */
function TurnBubbles({ turn }: TurnBubblesProps) {
  const responses = turn.agentResponses?.length
    ? turn.agentResponses
    : turn.agentResponse.split("\n\n").filter((s) => s.trim());

  return (
    <SpaceBetween size="xs">
      {/* Customer message — right-aligned */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "75%",
            padding: "6px 10px",
            borderRadius: "12px 12px 2px 12px",
            backgroundColor: "#0972d3",
            color: "#ffffff",
            fontSize: "14px",
            lineHeight: "1.4",
          }}
        >
          {turn.customerUtterance}
        </div>
      </div>

      {/* Agent responses — left-aligned, one bubble per message */}
      {responses.map((response, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{ maxWidth: "75%" }}>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: "12px 12px 12px 2px",
                backgroundColor: "#e9ebed",
                color: "#000716",
                fontSize: "14px",
                lineHeight: "1.4",
              }}
            >
              {response}
            </div>
            {i === responses.length - 1 && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#5f6b7a",
                  marginTop: "2px",
                  paddingLeft: "4px",
                }}
              >
                ⏱ {turn.latencyMs}ms
              </div>
            )}
          </div>
        </div>
      ))}
    </SpaceBetween>
  );
}
