// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Toggle from "@cloudscape-design/components/toggle";

import type { BatchResultState } from "./use-batch-state";
import BatchLatencyChart from "./BatchLatencyChart";
import { HelpIcon } from "../contextual-help";
import { formatElapsedTime } from "../test-harness/batch-stats";
import { computeAggregateStats } from "../test-harness/batch-stats";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface RunOverviewPanelProps {
  state: BatchResultState;
  onStopAll: () => void;
  isStopping: boolean;
  onConcurrencyChange: (n: number) => void;
  onDismiss: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Run Overview Panel (Level 1 UI).
 *
 * Displays real-time aggregate progress during a batch run:
 * - Segmented progress bar (completed / active / queued)
 * - Status counters per termination reason
 * - Aggregate latency stats (average, p50, p95)
 * - Elapsed time in HH:MM:SS, updated every second
 * - "Stop All" button
 *
 * Remains visible with final stats after batch completes.
 */
export default function RunOverviewPanel({
  state,
  onStopAll,
  isStopping,
  onConcurrencyChange,
  onDismiss,
}: RunOverviewPanelProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [concurrencyInput, setConcurrencyInput] = useState(String(state.concurrencyLimit));
  const [showChart, setShowChart] = useState(false);

  // Keep the input in sync when the limit changes (e.g. via +/- buttons updating state)
  useEffect(() => {
    setConcurrencyInput(String(state.concurrencyLimit));
  }, [state.concurrencyLimit]);

  // ─── Elapsed Time Timer ──────────────────────────────────────────────────

  useEffect(() => {
    const startTime = new Date(state.startTimestamp).getTime();

    // If batch is completed, show final elapsed time
    if (state.status === "completed" && state.endTimestamp) {
      const endTime = new Date(state.endTimestamp).getTime();
      setElapsedMs(endTime - startTime);
      return;
    }

    // Update elapsed time every second while running
    const update = () => setElapsedMs(Date.now() - startTime);
    update(); // immediate first update

    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [state.startTimestamp, state.endTimestamp, state.status]);

  // ─── Derived Progress ────────────────────────────────────────────────────

  const total = state.iterationCount;
  const completedCount = state.iterations.filter(
    (it) => it.status === "completed" || it.status === "failed"
  ).length;
  const activeCount = state.iterations.filter(
    (it) => it.status === "running" || it.status === "backoff"
  ).length;
  const queuedCount = total - completedCount - activeCount;

  // ─── Status Counters ─────────────────────────────────────────────────────

  const counts = {
    completed: 0,
    exit_branch: 0,
    max_timeout: 0,
    user_stopped: 0,
    failed: 0,
  };

  for (const it of state.iterations) {
    if (it.terminationReason) {
      counts[it.terminationReason]++;
    }
  }

  // ─── Latency Stats ──────────────────────────────────────────────────────

  const finishedIterations = state.iterations.filter(
    (it) => it.status === "completed" || it.status === "failed"
  );

  const liveStats =
    state.aggregateStats ?? (finishedIterations.length > 0 ? computeAggregateStats(finishedIterations) : null);

  const hasLatency = liveStats?.latency != null;

  // ─── Progress Bar Segments ───────────────────────────────────────────────

  // When running: show completed/active/queued segments
  // When complete: show per-termination-reason segments (colored by status)
  const isComplete = state.status === "completed";

  // Per-status colors
  const STATUS_COLORS = {
    completed: "#037f0c",    // green
    exit_branch: "#f89256",  // orange/warning
    max_timeout: "#d91515",  // red/error
    user_stopped: "#5f6b7a", // grey
    failed: "#d91515",       // red/error
  };

  // Running-mode percentages
  const completedPct = total > 0 ? (completedCount / total) * 100 : 0;
  const activePct = total > 0 ? (activeCount / total) * 100 : 0;
  const queuedPct = total > 0 ? (queuedCount / total) * 100 : 0;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <Toggle
                onChange={({ detail }) => setShowChart(detail.checked)}
                checked={showChart}
                disabled={state.status === "running" || state.status === "stopping"}
              >
                Chart <HelpIcon anchorId="latency-chart" pageId="testing" fieldName="Latency chart" />
              </Toggle>
              {(state.status === "running" || state.status === "stopping") && (
                <Button
                  variant="normal"
                  onClick={onStopAll}
                  disabled={isStopping}
                >
                  {isStopping ? "Stopping..." : "Stop All"}
                </Button>
              )}
              {state.status === "completed" && (
                <Button variant="normal" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          }
        >
          Batch Run — {state.scriptName}
        </Header>
      }
    >
      <div style={{ minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      {showChart ? (
        <BatchLatencyChart iterations={state.iterations} />
      ) : (
      <>
        {/* Progress Bar */}
        <div>
          <Box variant="awsui-key-label">
            Progress — {completedCount}/{total} iterations
          </Box>
          <div
            style={{
              display: "flex",
              height: "20px",
              borderRadius: "4px",
              overflow: "hidden",
              marginTop: "4px",
              backgroundColor: "#e9ebed",
            }}
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`Batch progress: ${completedCount} completed, ${activeCount} active, ${queuedCount} queued`}
          >
            {isComplete ? (
              /* When complete: show per-termination-reason colored segments */
              <>
                {(["completed", "exit_branch", "max_timeout", "user_stopped", "failed"] as const).map((reason) => {
                  const count = counts[reason];
                  if (count === 0) return null;
                  const pct = (count / total) * 100;
                  return (
                    <div
                      key={reason}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: STATUS_COLORS[reason],
                        transition: "width 0.3s ease",
                      }}
                      title={`${reason}: ${count}`}
                    />
                  );
                })}
              </>
            ) : (
              /* When running: show completed/active/queued segments */
              <>
                {completedPct > 0 && (
                  <div
                    style={{
                      width: `${completedPct}%`,
                      backgroundColor: "#037f0c",
                      transition: "width 0.3s ease",
                    }}
                    title={`Completed: ${completedCount}`}
                  />
                )}
                {activePct > 0 && (
                  <div
                    style={{
                      width: `${activePct}%`,
                      backgroundColor: "#0972d3",
                      transition: "width 0.3s ease",
                    }}
                    title={`Active: ${activeCount}`}
                  />
                )}
                {queuedPct > 0 && (
                  <div
                    style={{
                      width: `${queuedPct}%`,
                      backgroundColor: "#d1d5db",
                      transition: "width 0.3s ease",
                    }}
                    title={`Queued: ${queuedCount}`}
                  />
                )}
              </>
            )}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "12px", flexWrap: "wrap" }}>
            {isComplete ? (
              /* Per-status legend when complete */
              <>
                {(["completed", "exit_branch", "max_timeout", "user_stopped", "failed"] as const).map((reason) => {
                  const count = counts[reason];
                  if (count === 0) return null;
                  return (
                    <span key={reason}>
                      <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: STATUS_COLORS[reason], borderRadius: "2px", marginRight: "4px" }} />
                      {reason.replace("_", " ")} ({count})
                    </span>
                  );
                })}
              </>
            ) : (
              /* Running legend */
              <>
                <span>
                  <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#037f0c", borderRadius: "2px", marginRight: "4px" }} />
                  Completed ({completedCount})
                </span>
                <span>
                  <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#0972d3", borderRadius: "2px", marginRight: "4px" }} />
                  Active ({activeCount})
                </span>
                <span>
                  <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: "#d1d5db", borderRadius: "2px", marginRight: "4px" }} />
                  Queued ({queuedCount})
                </span>
              </>
            )}
          </div>
        </div>

        {/* Status Counters + Latency + Elapsed + Concurrency */}
        <ColumnLayout columns={4} variant="text-grid">
          {/* Status Counters */}
          <div>
            <Box variant="awsui-key-label">Status Counters</Box>
            <SpaceBetween size="xxs">
              <div>Completed: <strong>{counts.completed}</strong></div>
              <div>Exit branch: <strong>{counts.exit_branch}</strong></div>
              <div>Timeout: <strong>{counts.max_timeout}</strong></div>
              <div>User stopped: <strong>{counts.user_stopped}</strong></div>
              <div>Failed: <strong>{counts.failed}</strong></div>
            </SpaceBetween>
          </div>

          {/* Latency Stats */}
          <div>
            <Box variant="awsui-key-label">Latency</Box>
            <SpaceBetween size="xxs">
              <div>Average: <strong>{hasLatency ? `${Math.round(liveStats!.latency!.average)}ms` : "—"}</strong></div>
              <div>p50: <strong>{hasLatency ? `${Math.round(liveStats!.latency!.p50)}ms` : "—"}</strong></div>
              <div>p95: <strong>{hasLatency ? `${Math.round(liveStats!.latency!.p95)}ms` : "—"}</strong></div>
            </SpaceBetween>
          </div>

          {/* Elapsed Time */}
          <div>
            <Box variant="awsui-key-label">Elapsed Time</Box>
            <div style={{ fontSize: "24px", fontFamily: "monospace", fontWeight: "bold" }}>
              {formatElapsedTime(elapsedMs)}
            </div>
            {state.status === "completed" && (
              <Box variant="small" color="text-status-success">
                Batch complete
              </Box>
            )}
            {state.status === "stopping" && (
              <Box variant="small" color="text-status-warning">
                Stopping...
              </Box>
            )}
          </div>

          {/* Live Concurrency Adjustment */}
          <div>
            <Box variant="awsui-key-label">Target concurrency</Box>
            {state.status === "running" ? (
              <SpaceBetween direction="horizontal" size="xs">
                <div style={{ width: "80px" }}>
                  <Input
                    type="number"
                    value={concurrencyInput}
                    inputMode="numeric"
                    onChange={({ detail }) => setConcurrencyInput(detail.value)}
                    onBlur={() => {
                      const n = parseInt(concurrencyInput, 10);
                      if (Number.isInteger(n) && n >= 1 && n <= 50) {
                        onConcurrencyChange(n);
                      } else {
                        // Revert to current limit on invalid input
                        setConcurrencyInput(String(state.concurrencyLimit));
                      }
                    }}
                    ariaLabel="Target concurrency"
                  />
                </div>
                <div style={{ display: "flex", gap: "2px" }}>
                  <Button
                    variant="icon"
                    iconName="subtract-minus"
                    ariaLabel="Decrease concurrency"
                    disabled={state.concurrencyLimit <= 1}
                    onClick={() => {
                      const next = Math.max(1, state.concurrencyLimit - 1);
                      setConcurrencyInput(String(next));
                      onConcurrencyChange(next);
                    }}
                  />
                  <Button
                    variant="icon"
                    iconName="add-plus"
                    ariaLabel="Increase concurrency"
                    disabled={state.concurrencyLimit >= 50}
                    onClick={() => {
                      const next = Math.min(50, state.concurrencyLimit + 1);
                      setConcurrencyInput(String(next));
                      onConcurrencyChange(next);
                    }}
                  />
                </div>
              </SpaceBetween>
            ) : (
              <strong>{state.concurrencyLimit}</strong>
            )}
          </div>
        </ColumnLayout>
      </>
      )}
      </div>
    </Container>
  );
}
