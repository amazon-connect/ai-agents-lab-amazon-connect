// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { computeTimeScale } from "../time-scale";
import type { Span } from "../../sessions/types";

function makeSpan(startMs: number, endMs: number): Span {
  return {
    spanId: "span-1",
    spanName: "invoke_agent",
    spanType: "SERVER",
    startTimestamp: new Date(startMs).toISOString(),
    endTimestamp: new Date(endMs).toISOString(),
    status: "OK",
    originRequestId: "req-1",
    attributes: {},
  };
}

describe("computeTimeScale", () => {
  it("returns empty scale for empty spans array", () => {
    const scale = computeTimeScale([], 800, 0.1);

    expect(scale.originMs).toBe(0);
    expect(scale.endMs).toBe(0);
    expect(scale.durationMs).toBe(0);
    expect(scale.totalWidth).toBe(0);
    expect(scale.ticks).toHaveLength(0);
    expect(scale.msToX(1000)).toBe(0);
  });

  it("computes correct time boundaries from spans", () => {
    const spans = [
      makeSpan(1000, 3000),
      makeSpan(2000, 5000),
      makeSpan(500, 2500),
    ];

    const scale = computeTimeScale(spans, 800, 0.1);

    expect(scale.originMs).toBe(500);
    expect(scale.endMs).toBe(5000);
    expect(scale.durationMs).toBe(4500);
  });

  it("computes totalWidth from durationMs × pixelsPerMs", () => {
    const spans = [makeSpan(0, 10000)];
    const pixelsPerMs = 0.5;

    const scale = computeTimeScale(spans, 800, pixelsPerMs);

    expect(scale.totalWidth).toBe(10000 * 0.5);
  });

  it("msToX maps absolute timestamp to pixel position", () => {
    const spans = [makeSpan(1000, 5000)];
    const pixelsPerMs = 0.2;

    const scale = computeTimeScale(spans, 800, pixelsPerMs);

    // origin is 1000ms, so msToX(1000) = 0
    expect(scale.msToX(1000)).toBe(0);
    // msToX(3000) = (3000 - 1000) * 0.2 = 400
    expect(scale.msToX(3000)).toBe(400);
    // msToX(5000) = (5000 - 1000) * 0.2 = 800
    expect(scale.msToX(5000)).toBe(800);
  });

  it("selects tick interval ensuring ≥ 60px spacing", () => {
    // pixelsPerMs = 0.01 → 1000ms * 0.01 = 10px (too small)
    // 5000ms * 0.01 = 50px (too small)
    // 10000ms * 0.01 = 100px (≥ 60px, selected)
    const spans = [makeSpan(0, 120000)];
    const scale = computeTimeScale(spans, 800, 0.01);

    expect(scale.tickInterval).toBe(10000);
  });

  it("selects 1s interval when spacing is sufficient", () => {
    // pixelsPerMs = 0.1 → 1000ms * 0.1 = 100px (≥ 60px)
    const spans = [makeSpan(0, 5000)];
    const scale = computeTimeScale(spans, 800, 0.1);

    expect(scale.tickInterval).toBe(1000);
  });

  it("falls back to 60s interval when no interval meets spacing", () => {
    // pixelsPerMs = 0.0001 → even 60000ms * 0.0001 = 6px (< 60px)
    const spans = [makeSpan(0, 600000)];
    const scale = computeTimeScale(spans, 800, 0.0001);

    expect(scale.tickInterval).toBe(60000);
  });

  it("generates tick marks starting at 0 with correct labels", () => {
    const spans = [makeSpan(0, 5000)];
    const scale = computeTimeScale(spans, 800, 0.1);

    expect(scale.ticks.length).toBeGreaterThan(0);
    expect(scale.ticks[0]?.timeMs).toBe(0);
    expect(scale.ticks[0]?.x).toBe(0);
    expect(scale.ticks[0]?.label).toBe("0s");
  });

  it("formats tick labels correctly for sub-10s values", () => {
    // With 1s interval and 5s duration
    const spans = [makeSpan(0, 5000)];
    const scale = computeTimeScale(spans, 800, 0.1);

    const labels = scale.ticks.map((t) => t.label);
    expect(labels).toContain("0s");
    expect(labels).toContain("1s");
    expect(labels).toContain("2s");
    expect(labels).toContain("3s");
    expect(labels).toContain("4s");
    expect(labels).toContain("5s");
  });

  it("formats tick labels correctly for ≥ 10s values", () => {
    // With 10s interval
    const spans = [makeSpan(0, 60000)];
    const scale = computeTimeScale(spans, 800, 0.01);

    const labels = scale.ticks.map((t) => t.label);
    expect(labels).toContain("0s");
    expect(labels).toContain("10s");
    expect(labels).toContain("20s");
    expect(labels).toContain("30s");
    expect(labels).toContain("40s");
    expect(labels).toContain("50s");
    expect(labels).toContain("1m");
  });

  it("formats tick labels for minute boundaries", () => {
    // With 60s interval
    const spans = [makeSpan(0, 300000)];
    const scale = computeTimeScale(spans, 800, 0.001);

    const labels = scale.ticks.map((t) => t.label);
    expect(labels).toContain("0s");
    expect(labels).toContain("1m");
    expect(labels).toContain("2m");
    expect(labels).toContain("3m");
    expect(labels).toContain("4m");
    expect(labels).toContain("5m");
  });

  it("handles single span correctly", () => {
    const spans = [makeSpan(1000, 2000)];
    const scale = computeTimeScale(spans, 800, 1);

    expect(scale.originMs).toBe(1000);
    expect(scale.endMs).toBe(2000);
    expect(scale.durationMs).toBe(1000);
    expect(scale.totalWidth).toBe(1000);
  });
});
