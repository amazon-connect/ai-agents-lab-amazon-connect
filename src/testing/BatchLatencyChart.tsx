// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";

import Box from "@cloudscape-design/components/box";
import MixedLineBarChart from "@cloudscape-design/components/mixed-line-bar-chart";

import type { IterationResult } from "../test-harness/batch-types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BatchLatencyChartProps {
  iterations: IterationResult[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute histogram buckets from duration values.
 * Auto-sizes buckets based on the data range.
 */
function buildHistogram(durations: number[]): Array<{ label: string; count: number }> {
  if (durations.length === 0) return [];

  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const range = max - min;

  // Choose bucket size: aim for ~10-15 buckets
  let bucketSize: number;
  if (range <= 5000) bucketSize = 500;       // 0.5s buckets
  else if (range <= 15000) bucketSize = 1000; // 1s buckets
  else if (range <= 60000) bucketSize = 5000; // 5s buckets
  else bucketSize = 10000;                    // 10s buckets

  const startBucket = Math.floor(min / bucketSize) * bucketSize;
  const endBucket = Math.ceil((max + 1) / bucketSize) * bucketSize;

  const buckets: Array<{ label: string; count: number }> = [];
  for (let b = startBucket; b < endBucket; b += bucketSize) {
    const label = `${(b / 1000).toFixed(1)}–${((b + bucketSize) / 1000).toFixed(1)}s`;
    const count = durations.filter((d) => d >= b && d < b + bucketSize).length;
    if (count > 0) {
      buckets.push({ label, count });
    }
  }

  return buckets;
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  const fraction = rank - lower;
  return sorted[lower]! + fraction * (sorted[upper]! - sorted[lower]!);
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Displays a latency distribution histogram with p50/p95 info.
 * Rendered inline (no Container wrapper) — intended to be embedded
 * inside RunOverviewPanel when the Chart toggle is active.
 */
export default function BatchLatencyChart({ iterations }: BatchLatencyChartProps) {
  const { barSeries, xDomain, p50, p95, hasData } = useMemo(() => {
    // Only include iterations that completed with a transcript or voiceTurns
    const durations = iterations
      .filter((it) => it.status === "completed" && (it.transcript != null || (it.voiceTurns != null && it.voiceTurns.length > 0)))
      .map((it) => it.durationMs);

    if (durations.length === 0) {
      return { barSeries: [], xDomain: [], p50: 0, p95: 0, hasData: false };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const p50Val = computePercentile(sorted, 50);
    const p95Val = computePercentile(sorted, 95);

    const buckets = buildHistogram(durations);
    const barData = buckets.map((b) => ({ x: b.label, y: b.count }));
    const domain = buckets.map((b) => b.label);

    return {
      barSeries: [
        {
          type: "bar" as const,
          title: "Iterations",
          data: barData,
          color: "#0972d3",
        },
      ],
      xDomain: domain,
      p50: p50Val,
      p95: p95Val,
      hasData: true,
    };
  }, [iterations]);

  if (!hasData) {
    return (
      <Box variant="p" color="text-body-secondary" textAlign="center" padding="l">
        No completed iterations to chart yet.
      </Box>
    );
  }

  return (
    <div>
      <Box variant="small" color="text-body-secondary" margin={{ bottom: "xs" }}>
        p50: {(p50 / 1000).toFixed(1)}s · p95: {(p95 / 1000).toFixed(1)}s
      </Box>
      <MixedLineBarChart
        series={barSeries}
        xDomain={xDomain}
        xScaleType="categorical"
        xTitle="Duration"
        yTitle="Count"
        height={220}
        hideFilter
        hideLegend
      />
    </div>
  );
}
