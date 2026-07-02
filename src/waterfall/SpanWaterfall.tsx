// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef } from "react";

import type { Span, SpanTree } from "../sessions/types";
import { useContainerResize } from "./useContainerResize";
import { useWaterfallLayout } from "./useWaterfallLayout";
import { useZoom } from "./useZoom";
import { WaterfallHeader } from "./WaterfallHeader";
import { TimeAxis } from "./TimeAxis";
import { SpanBar } from "./SpanBar";
import { ZoomControls } from "./ZoomControls";
import { getSpanColour } from "./span-colours";
import { computeTimeScale } from "./time-scale";
import { formatDuration } from "./format-duration";

export interface SpanWaterfallProps {
  /** The hierarchical span tree to render */
  tree: SpanTree;
  /** Session identifier for accessibility label */
  sessionId: string;
  /** Currently selected span ID (controlled) */
  selectedSpanId?: string;
  /** Called when a span is selected */
  onSpanSelect?: (span: Span) => void;
  /** Called when the current span is deselected */
  onSpanDeselect?: () => void;
}

const ROW_HEIGHT = 28;
const BAR_HEIGHT = 20;
const BAR_Y_PADDING = 4;
const TIME_AXIS_HEIGHT = 28;
const MIN_LABEL_WIDTH = 200;

/**
 * Top-level waterfall visualisation component.
 *
 * Renders a two-column layout: sticky row labels on the left and a
 * horizontally scrollable SVG area on the right containing the time axis
 * and span bars. Supports zoom, selection, and responsive resizing.
 */
export const SpanWaterfall: React.FC<SpanWaterfallProps> = ({
  tree,
  sessionId,
  selectedSpanId,
  onSpanSelect,
  onSpanDeselect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerResize(containerRef);

  // Compute layout width available for the SVG area (subtract label column)
  const svgContainerWidth = Math.max(0, containerWidth - MIN_LABEL_WIDTH);

  const layout = useWaterfallLayout(tree, 1, svgContainerWidth);
  const durationMs = layout.timeRange.durationMs || 1;

  const zoom = useZoom(svgContainerWidth, durationMs);

  // Recompute layout with actual zoom level
  const zoomedLayout = useWaterfallLayout(tree, zoom.pixelsPerMs, svgContainerWidth);

  // Compute time scale for the TimeAxis component
  const spans = zoomedLayout.rows.map((r) => r.span);
  const timeScale = computeTimeScale(spans, svgContainerWidth, zoom.pixelsPerMs);

  // Maintain viewport centre on zoom change
  const prevPixelsPerMsRef = useRef(zoom.pixelsPerMs);
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const prevPpm = prevPixelsPerMsRef.current;
    const newPpm = zoom.pixelsPerMs;

    if (prevPpm !== newPpm && prevPpm > 0) {
      const viewportCentre = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
      const timeAtCentre = viewportCentre / prevPpm;
      const newScrollLeft = timeAtCentre * newPpm - scrollEl.clientWidth / 2;
      scrollEl.scrollLeft = Math.max(0, newScrollLeft);
    }

    prevPixelsPerMsRef.current = newPpm;
  }, [zoom.pixelsPerMs]);

  // Attach wheel handler for Ctrl/Meta+scroll zoom
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handler = zoom.handleWheel;
    scrollEl.addEventListener("wheel", handler, { passive: false });
    return () => scrollEl.removeEventListener("wheel", handler);
  }, [zoom.handleWheel]);

  // Selection handler
  const handleSpanClick = useCallback(
    (span: Span) => {
      if (selectedSpanId === span.spanId) {
        onSpanDeselect?.();
      } else {
        onSpanSelect?.(span);
      }
    },
    [selectedSpanId, onSpanSelect, onSpanDeselect]
  );

  // Determine effective selection: clear if selectedSpanId references non-existent span
  const spanExists = selectedSpanId
    ? zoomedLayout.rows.some((r) => r.span.spanId === selectedSpanId)
    : false;
  const effectiveSelectedId = spanExists ? selectedSpanId : undefined;

  // Empty state
  if (tree.roots.length === 0) {
    return (
      <div
        ref={containerRef}
        data-testid="span-waterfall-empty"
        style={{
          padding: "24px",
          textAlign: "center",
          fontFamily: "var(--font-family-base)",
          color: "var(--color-text-body-secondary)",
        }}
      >
        No spans available to display.
      </div>
    );
  }

  // Pre-compute idle gaps between root-level groups (>1s)
  const MIN_GAP_THRESHOLD_MS = 1000;
  interface IdleGap {
    gapMs: number;
    startMs: number; // absolute epoch ms
    endMs: number;   // absolute epoch ms
    insertBeforeIndex: number;
  }
  const idleGaps: IdleGap[] = [];
  {
    let prevGroupEndMs = -1;
    for (let i = 0; i < zoomedLayout.rows.length; i++) {
      const row = zoomedLayout.rows[i];
      if (!row) continue;

      if (row.isFirstInGroup && i > 0) {
        const currentGroupStartMs = new Date(row.span.startTimestamp).getTime();
        if (prevGroupEndMs > 0 && currentGroupStartMs - prevGroupEndMs >= MIN_GAP_THRESHOLD_MS) {
          idleGaps.push({
            gapMs: currentGroupStartMs - prevGroupEndMs,
            startMs: prevGroupEndMs,
            endMs: currentGroupStartMs,
            insertBeforeIndex: i,
          });
        }
      }

      const rowEndMs = new Date(row.span.endTimestamp).getTime();
      if (row.isFirstInGroup) {
        prevGroupEndMs = rowEndMs;
      } else if (rowEndMs > prevGroupEndMs) {
        prevGroupEndMs = rowEndMs;
      }
    }
  }

  // Build a combined row list: span rows + idle rows interleaved
  type DisplayRow =
    | { type: "span"; index: number }
    | { type: "idle"; gap: IdleGap };

  const displayRows: DisplayRow[] = [];
  const idleGapByIndex = new Map(idleGaps.map((g) => [g.insertBeforeIndex, g]));
  for (let i = 0; i < zoomedLayout.rows.length; i++) {
    const gap = idleGapByIndex.get(i);
    if (gap) {
      displayRows.push({ type: "idle", gap });
    }
    displayRows.push({ type: "span", index: i });
  }

  // Compute SVG height and Y positions for all display rows (uniform height)
  const totalDisplayRows = displayRows.length;
  const svgHeight = TIME_AXIS_HEIGHT + totalDisplayRows * ROW_HEIGHT;
  const displayRowYPositions: number[] = [];
  for (let i = 0; i < totalDisplayRows; i++) {
    displayRowYPositions.push(TIME_AXIS_HEIGHT + i * ROW_HEIGHT);
  }

  const totalSvgWidth = Math.max(zoomedLayout.totalWidth, svgContainerWidth);

  // Format span names for display: "invoke_agent" → "Invoke Agent"
  function formatSpanLabel(spanName: string): string {
    return spanName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Build label list for RowLabels (includes idle labels)
  const rowLabels: Array<{ key: string; label: string; depth: number }> = [];
  for (const dr of displayRows) {
    if (dr.type === "span") {
      const row = zoomedLayout.rows[dr.index]!;
      rowLabels.push({ key: row.span.spanId, label: formatSpanLabel(row.span.spanName), depth: row.depth });
    } else {
      rowLabels.push({ key: `idle-${dr.gap.insertBeforeIndex}`, label: "Idle", depth: 0 });
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="span-waterfall"
      style={{ width: "100%", overflow: "hidden" }}
    >
      {/* Header row: legend + zoom controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--color-border-divider-default)",
        }}
      >
        <WaterfallHeader />
        <div style={{ padding: "8px 12px" }}>
          <ZoomControls
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            canZoomIn={zoom.canZoomIn}
            canZoomOut={zoom.canZoomOut}
          />
        </div>
      </div>

      {/* Two-column layout: sticky labels + scrollable SVG */}
      <div style={{ display: "flex", overflow: "hidden" }}>
        {/* Left column: sticky row labels */}
        <div
          style={{
            minWidth: MIN_LABEL_WIDTH,
            flexShrink: 0,
            borderRight: "1px solid var(--color-border-divider-default)",
            overflowY: "auto",
          }}
        >
          {/* Spacer for time axis alignment */}
          <div style={{ height: TIME_AXIS_HEIGHT }} />
          <div
            style={{
              minWidth: MIN_LABEL_WIDTH,
              fontFamily: "var(--font-family-base)",
              fontSize: "12px",
              color: "var(--color-text-body-default)",
            }}
          >
            {rowLabels.map((rl) => (
              <div
                key={rl.key}
                style={{
                  height: ROW_HEIGHT,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: rl.label === "Idle" ? "var(--color-text-body-secondary)" : undefined,
                  fontStyle: rl.label === "Idle" ? "italic" : undefined,
                  fontSize: rl.label === "Idle" ? "11px" : undefined,
                }}
                title={rl.label}
              >
                {rl.label}
              </div>
            ))}
          </div>
        </div>

        {/* Right column: scrollable area with time axis + SVG bars */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowX: "auto",
            overflowY: "auto",
          }}
        >
          <svg
            role="img"
            aria-label={`Waterfall visualisation for session ${sessionId} with ${tree.totalCount} spans`}
            width={totalSvgWidth}
            height={svgHeight}
            style={{ display: "block" }}
          >
            {/* Time axis (sticky top via SVG positioning) */}
            <g transform={`translate(0, 0)`}>
              <TimeAxis timeScale={timeScale} height={TIME_AXIS_HEIGHT} />
            </g>

            {/* Span bars and idle rows */}
            {displayRows.map((dr, displayIndex) => {
              const y = displayRowYPositions[displayIndex] ?? 0;

              if (dr.type === "idle") {
                // Render idle row: dashed line with centered duration label
                const gap = dr.gap;
                const x1 = (gap.startMs - timeScale.originMs) * zoom.pixelsPerMs;
                const x2 = (gap.endMs - timeScale.originMs) * zoom.pixelsPerMs;
                const centerY = y + ROW_HEIGHT / 2;
                const midX = (x1 + x2) / 2;
                const labelText = `⏱ ${formatDuration(gap.gapMs)}`;
                // Approximate label width to create a gap in the dashed line
                const labelWidth = labelText.length * 7 + 12;
                const gapLeft = midX - labelWidth / 2;
                const gapRight = midX + labelWidth / 2;

                return (
                  <g key={`idle-${gap.insertBeforeIndex}`}>
                    {/* Left segment of dashed line */}
                    {gapLeft > x1 && (
                      <line
                        x1={x1}
                        y1={centerY}
                        x2={gapLeft}
                        y2={centerY}
                        stroke="#aab7b8"
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                      />
                    )}
                    {/* Right segment of dashed line */}
                    {gapRight < x2 && (
                      <line
                        x1={gapRight}
                        y1={centerY}
                        x2={x2}
                        y2={centerY}
                        stroke="#aab7b8"
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                      />
                    )}
                    {/* Centered label */}
                    <text
                      x={midX}
                      y={centerY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fontFamily: "var(--font-family-base)",
                        fontSize: "11px",
                        fill: "#aab7b8",
                      }}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              }

              // Render span bar
              const row = zoomedLayout.rows[dr.index]!;
              const barY = y + BAR_Y_PADDING;
              const colour = getSpanColour(row.span.spanName, row.span.status);
              const isSelected = effectiveSelectedId === row.span.spanId;

              return (
                <g key={row.span.spanId}>
                  <SpanBar
                    x={row.xStart}
                    y={barY}
                    width={row.width}
                    height={BAR_HEIGHT}
                    colour={colour}
                    isSelected={isSelected}
                    onClick={() => handleSpanClick(row.span)}
                    spanId={row.span.spanId}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
