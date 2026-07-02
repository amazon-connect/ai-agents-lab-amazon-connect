// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import type { TableProps } from "@cloudscape-design/components/table";

import type { ConversationTranscript, TurnTranscript } from "../test-harness/script-types";
import type { VoiceTranscript, VoiceTurnTranscript } from "../test-harness/voice-types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ScriptMetricsPanelProps {
  /** Chat transcript (from script-runner) */
  chatTranscript?: ConversationTranscript | null;
  /** Voice transcript (from voice-script-executor) */
  voiceTranscript?: VoiceTranscript | null;
  /** Synthesis duration in ms (voice only) */
  synthesisDurationMs?: number;
  /** Called when user dismisses the panel */
  onDismiss: () => void;
}

// ─── Unified Turn Row ────────────────────────────────────────────────────────

interface TurnRow {
  /** Unique key for table tracking */
  rowKey: string;
  turnNumber: number;
  responseNumber?: number;
  customerUtterance: string;
  latencyMs: number;
}

// ─── Metrics Helpers ─────────────────────────────────────────────────────────

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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScriptMetricsPanel({
  chatTranscript,
  voiceTranscript,
  synthesisDurationMs,
  onDismiss,
}: ScriptMetricsPanelProps) {
  const isVoice = voiceTranscript != null;
  const transcript = voiceTranscript ?? chatTranscript;

  // Should not render if no transcript
  if (!transcript) return null;

  const terminationReason = transcript.terminationReason;
  const totalDurationMs = transcript.totalDurationMs;
  const turnsCompleted = transcript.turnsCompleted;
  const turnsTotal = transcript.turnsTotal;

  // ─── Build Turn Rows ───────────────────────────────────────────────────

  const turnRows: TurnRow[] = useMemo(() => {
    if (isVoice) {
      return (voiceTranscript!.turns as VoiceTurnTranscript[]).map((turn) => ({
        rowKey: `turn-${turn.turnIndex}`,
        turnNumber: turn.turnIndex + 1,
        customerUtterance: turn.customerUtterance,
        latencyMs: turn.latencyMs,
      }));
    }
    // Chat: flatten per-response latencies when available
    const rows: TurnRow[] = [];
    for (const turn of chatTranscript!.turns as TurnTranscript[]) {
      if (turn.responseLatencies && turn.responseLatencies.length > 1) {
        // Multiple responses — one row per response
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
        // Single response or no responseLatencies — one row per turn
        rows.push({
          rowKey: `turn-${turn.turnIndex}`,
          turnNumber: turn.turnIndex + 1,
          customerUtterance: turn.customerUtterance,
          latencyMs: turn.responseLatencies?.[0] ?? turn.latencyMs,
        });
      }
    }
    return rows;
  }, [isVoice, chatTranscript, voiceTranscript]);

  // ─── Determine if we have per-response data (for column display) ───────

  const hasResponseLatencies = useMemo(() => {
    if (isVoice) return false;
    return (chatTranscript!.turns as TurnTranscript[]).some(
      (t) => t.responseLatencies && t.responseLatencies.length > 1
    );
  }, [isVoice, chatTranscript]);

  // ─── Aggregate Stats (skip turn 0 for chat) ───────────────────────────

  const stats = useMemo(() => {
    if (isVoice) {
      const latencies = turnRows.map((row) => row.latencyMs);
      return computeStats(latencies);
    }
    // Chat: use all flattened response latencies, excluding turn 1
    const latencies = turnRows
      .filter((row) => row.turnNumber > 1)
      .map((row) => row.latencyMs);
    return computeStats(latencies);
  }, [turnRows, isVoice]);

  // ─── Status Indicator ──────────────────────────────────────────────────

  const statusType =
    terminationReason === "completed"
      ? "success"
      : terminationReason === "user_stopped"
        ? "stopped"
        : "warning";

  // ─── Column Definitions ────────────────────────────────────────────────

  const columnDefinitions: TableProps.ColumnDefinition<TurnRow>[] = useMemo(() => {
    const cols: TableProps.ColumnDefinition<TurnRow>[] = [
      {
        id: "turnNumber",
        header: "Turn #",
        cell: (item) => item.turnNumber,
        width: 80,
      },
    ];

    if (hasResponseLatencies) {
      cols.push({
        id: "responseNumber",
        header: "Response #",
        cell: (item) => item.responseNumber ?? "",
        width: 100,
      });
    }

    cols.push(
      {
        id: "customerUtterance",
        header: "Customer utterance",
        cell: (item) => truncate(item.customerUtterance, 40),
        width: 280,
      },
      {
        id: "latencyMs",
        header: "Time to response (ms)",
        cell: (item) => Math.round(item.latencyMs),
        width: 180,
      }
    );

    return cols;
  }, [hasResponseLatencies]);

  // ─── Summary Key-Value Pairs ───────────────────────────────────────────

  const summaryItems = useMemo(() => {
    const items = [
      {
        label: "Termination reason",
        value: (
          <StatusIndicator type={statusType}>
            {terminationReason.replace("_", " ")}
          </StatusIndicator>
        ),
      },
      {
        label: "Total duration",
        value: `${(totalDurationMs / 1000).toFixed(1)}s`,
      },
      {
        label: "Turns",
        value: `${turnsCompleted}/${turnsTotal}`,
      },
    ];

    if (isVoice && synthesisDurationMs != null) {
      items.push({
        label: "Synthesis duration",
        value: `${(synthesisDurationMs / 1000).toFixed(1)}s`,
      });
    }

    return items;
  }, [terminationReason, totalDurationMs, turnsCompleted, turnsTotal, isVoice, synthesisDurationMs, statusType]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <Button variant="normal" onClick={onDismiss}>
              Dismiss
            </Button>
          }
        >
          Script Metrics
        </Header>
      }
    >
      <SpaceBetween size="l">
        {/* Summary Row */}
        <KeyValuePairs columns={isVoice ? 4 : 3} items={summaryItems} />

        {/* Per-Turn Table */}
        <Table
          items={turnRows}
          columnDefinitions={columnDefinitions}
          variant="embedded"
          stripedRows
          trackBy="rowKey"
          header={
            <Header variant="h3" counter={`(${turnRows.length})`}>
              Per-turn latency
            </Header>
          }
          empty="No turns recorded."
        />

        {/* Aggregate Stats */}
        {turnRows.length > (isVoice ? 0 : 1) && (
          <Box>
            <Box variant="awsui-key-label">Response latency{!isVoice && " (excluding turn 1)"}</Box>
            <SpaceBetween direction="horizontal" size="l">
              <span>
                Average: <strong>{Math.round(stats.average)}ms</strong>
              </span>
              <span>
                p50: <strong>{Math.round(stats.p50)}ms</strong>
              </span>
              <span>
                p95: <strong>{Math.round(stats.p95)}ms</strong>
              </span>
            </SpaceBetween>
          </Box>
        )}
      </SpaceBetween>
    </Container>
  );
}
