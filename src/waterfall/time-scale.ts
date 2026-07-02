// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Span } from "../sessions/types";

export interface TickMark {
  /** Milliseconds from session start */
  timeMs: number;
  /** Pixel position */
  x: number;
  /** Formatted label ("0s", "1.2s", "10s", "1m") */
  label: string;
}

export interface TimeScale {
  /** Earliest startTimestamp in ms (epoch) */
  originMs: number;
  /** Latest endTimestamp in ms (epoch) */
  endMs: number;
  /** Total session duration in ms */
  durationMs: number;
  /** Current zoom level */
  pixelsPerMs: number;
  /** Total SVG width in pixels */
  totalWidth: number;
  /** Milliseconds between ticks */
  tickInterval: number;
  /** Computed tick positions */
  ticks: TickMark[];
  /** Convert absolute timestamp (ms epoch) to pixel x position */
  msToX: (ms: number) => number;
}

const TICK_INTERVALS_MS = [1000, 5000, 10000, 30000, 60000];
const MIN_TICK_SPACING_PX = 60;

/**
 * Format a tick label from elapsed milliseconds.
 * - Under 10s: seconds with up to 1 decimal place (e.g., "0s", "1.2s", "9.5s")
 * - 10s to under 60s: whole seconds (e.g., "10s", "45s")
 * - 60s and above: minutes (e.g., "1m", "2m")
 */
function formatTickLabel(elapsedMs: number): string {
  const seconds = elapsedMs / 1000;

  if (seconds >= 60 && seconds % 60 === 0) {
    return `${Math.round(seconds / 60)}m`;
  }

  if (seconds >= 10) {
    return `${Math.round(seconds)}s`;
  }

  // Under 10 seconds: up to 1 decimal place
  const rounded = Math.round(seconds * 10) / 10;
  if (rounded === Math.floor(rounded)) {
    return `${rounded}s`;
  }
  return `${rounded.toFixed(1)}s`;
}

/**
 * Select the smallest tick interval from [1s, 5s, 10s, 30s, 60s]
 * that maintains at least 60px spacing between adjacent ticks.
 */
function selectTickInterval(pixelsPerMs: number): number {
  for (const interval of TICK_INTERVALS_MS) {
    const spacingPx = interval * pixelsPerMs;
    if (spacingPx >= MIN_TICK_SPACING_PX) {
      return interval;
    }
  }
  // Fallback to largest interval if none meet the spacing requirement
  return TICK_INTERVALS_MS[TICK_INTERVALS_MS.length - 1] ?? 60000;
}

/**
 * Compute the time scale for a set of spans.
 *
 * @param spans - Array of spans to compute the scale for
 * @param _containerWidth - Width of the container in pixels (reserved for future use)
 * @param pixelsPerMs - Current zoom level (pixels per millisecond)
 * @returns Computed TimeScale with tick marks and mapping function
 */
export function computeTimeScale(
  spans: Span[],
  _containerWidth: number,
  pixelsPerMs: number
): TimeScale {
  if (spans.length === 0) {
    return {
      originMs: 0,
      endMs: 0,
      durationMs: 0,
      pixelsPerMs,
      totalWidth: 0,
      tickInterval: 1000,
      ticks: [],
      msToX: () => 0,
    };
  }

  // Compute time boundaries
  let originMs = Infinity;
  let endMs = -Infinity;

  for (const span of spans) {
    const start = new Date(span.startTimestamp).getTime();
    const end = new Date(span.endTimestamp).getTime();

    if (start < originMs) originMs = start;
    if (end > endMs) endMs = end;
  }

  const durationMs = Math.max(0, endMs - originMs);
  const totalWidth = durationMs * pixelsPerMs;

  // Select tick interval
  const tickInterval = selectTickInterval(pixelsPerMs);

  // Generate tick marks
  const ticks: TickMark[] = [];
  let timeMs = 0;
  while (timeMs <= durationMs) {
    ticks.push({
      timeMs,
      x: timeMs * pixelsPerMs,
      label: formatTickLabel(timeMs),
    });
    timeMs += tickInterval;
  }

  // Mapping function: absolute timestamp (ms epoch) → pixel x
  const msToX = (ms: number): number => {
    return (ms - originMs) * pixelsPerMs;
  };

  return {
    originMs,
    endMs,
    durationMs,
    pixelsPerMs,
    totalWidth,
    tickInterval,
    ticks,
    msToX,
  };
}
