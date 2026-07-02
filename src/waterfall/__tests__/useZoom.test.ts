// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useZoom } from "../useZoom";

describe("useZoom", () => {
  const containerWidth = 1000;
  const durationMs = 10000; // 10 seconds

  it("initialises pixelsPerMs to min zoom (session fits in container)", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    // minZoom = 1000 / 10000 = 0.1
    expect(result.current.pixelsPerMs).toBe(0.1);
  });

  it("computes correct min and max zoom bounds", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    // minZoom = 1000 / 10000 = 0.1
    // maxZoom = 1000 / 100 = 10
    expect(result.current.pixelsPerMs).toBe(0.1);
    expect(result.current.canZoomIn).toBe(true);
    expect(result.current.canZoomOut).toBe(false);
  });

  it("zoomIn multiplies pixelsPerMs by 2", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    act(() => result.current.zoomIn());
    expect(result.current.pixelsPerMs).toBe(0.2);
  });

  it("zoomOut divides pixelsPerMs by 2", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    // Zoom in first so we can zoom out
    act(() => result.current.zoomIn());
    act(() => result.current.zoomOut());
    expect(result.current.pixelsPerMs).toBe(0.1);
  });

  it("clamps zoom at max level", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    // maxZoom = 10, starting at 0.1 → need 7 doublings to exceed (0.1 * 128 = 12.8 > 10)
    for (let i = 0; i < 10; i++) {
      act(() => result.current.zoomIn());
    }
    expect(result.current.pixelsPerMs).toBe(10); // clamped at max
    expect(result.current.canZoomIn).toBe(false);
  });

  it("clamps zoom at min level", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    // Already at min
    act(() => result.current.zoomOut());
    expect(result.current.pixelsPerMs).toBe(0.1); // stays at min
    expect(result.current.canZoomOut).toBe(false);
  });

  it("canZoomIn is false at max zoom", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    for (let i = 0; i < 10; i++) {
      act(() => result.current.zoomIn());
    }
    expect(result.current.canZoomIn).toBe(false);
  });

  it("canZoomOut is false at min zoom", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    expect(result.current.canZoomOut).toBe(false);
  });

  it("handleWheel zooms in on Ctrl + scroll up", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    const wheelEvent = new WheelEvent("wheel", {
      deltaY: -100,
      ctrlKey: true,
    });
    act(() => result.current.handleWheel(wheelEvent));
    expect(result.current.pixelsPerMs).toBe(0.2);
  });

  it("handleWheel zooms out on Ctrl + scroll down", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    // Zoom in first
    act(() => result.current.zoomIn());
    const wheelEvent = new WheelEvent("wheel", {
      deltaY: 100,
      ctrlKey: true,
    });
    act(() => result.current.handleWheel(wheelEvent));
    expect(result.current.pixelsPerMs).toBe(0.1);
  });

  it("handleWheel zooms in on Meta + scroll up", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    const wheelEvent = new WheelEvent("wheel", {
      deltaY: -100,
      metaKey: true,
    });
    act(() => result.current.handleWheel(wheelEvent));
    expect(result.current.pixelsPerMs).toBe(0.2);
  });

  it("handleWheel ignores scroll without Ctrl/Meta", () => {
    const { result } = renderHook(() => useZoom(containerWidth, durationMs));
    const wheelEvent = new WheelEvent("wheel", {
      deltaY: -100,
      ctrlKey: false,
      metaKey: false,
    });
    act(() => result.current.handleWheel(wheelEvent));
    expect(result.current.pixelsPerMs).toBe(0.1); // unchanged
  });

  it("handles zero durationMs gracefully", () => {
    const { result } = renderHook(() => useZoom(containerWidth, 0));
    // Should default to 1 for both min and max when duration is 0
    expect(result.current.pixelsPerMs).toBe(1);
  });

  it("handles zero containerWidth gracefully", () => {
    const { result } = renderHook(() => useZoom(0, durationMs));
    expect(result.current.pixelsPerMs).toBe(1);
  });
});
