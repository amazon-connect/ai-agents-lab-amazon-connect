// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";

import type { Span, SpanTree } from "../sessions/types";
import { flattenTree } from "./flatten-tree";
import { computeTimeScale } from "./time-scale";

export interface WaterfallRow {
  span: Span;
  depth: number;
  xStart: number;
  xEnd: number;
  width: number; // bar width in pixels (min 2px)
  isFirstInGroup: boolean;
}

export interface WaterfallLayout {
  /** Flattened list of rows in render order (depth-first) */
  rows: WaterfallRow[];
  /** Time boundaries */
  timeRange: { startMs: number; endMs: number; durationMs: number };
  /** Current scale */
  pixelsPerMs: number;
  /** Total SVG width in pixels */
  totalWidth: number;
}

const MIN_BAR_WIDTH_PX = 2;

/**
 * Hook that combines flatten-tree, time-scale, and compute-indent to produce
 * a complete waterfall layout ready for rendering.
 *
 * @param tree - The hierarchical span tree to lay out
 * @param pixelsPerMs - Current zoom level (pixels per millisecond)
 * @param containerWidth - Width of the container in pixels
 * @returns Computed WaterfallLayout with positioned rows
 */
export function useWaterfallLayout(
  tree: SpanTree,
  pixelsPerMs: number,
  containerWidth: number
): WaterfallLayout {
  return useMemo(() => {
    // Flatten the tree into depth-first ordered rows
    const flatRows = flattenTree(tree);

    // Collect all spans for time-scale computation
    const spans = flatRows.map((row) => row.span);

    // Compute the time scale (origin, end, ticks, msToX mapping)
    const timeScale = computeTimeScale(spans, containerWidth, pixelsPerMs);

    // Map each flat row to a positioned WaterfallRow
    const rows: WaterfallRow[] = flatRows.map((flatRow) => {
      const startMs = new Date(flatRow.span.startTimestamp).getTime();
      const endMs = new Date(flatRow.span.endTimestamp).getTime();

      const xStart = timeScale.msToX(startMs);
      const rawWidth = (endMs - startMs) * pixelsPerMs;
      const width = Math.max(MIN_BAR_WIDTH_PX, rawWidth);
      const xEnd = xStart + width;

      return {
        span: flatRow.span,
        depth: flatRow.depth,
        xStart,
        xEnd,
        width,
        isFirstInGroup: flatRow.isFirstInGroup,
      };
    });

    return {
      rows,
      timeRange: {
        startMs: timeScale.originMs,
        endMs: timeScale.endMs,
        durationMs: timeScale.durationMs,
      },
      pixelsPerMs,
      totalWidth: timeScale.totalWidth,
    };
  }, [tree, pixelsPerMs, containerWidth]);
}
