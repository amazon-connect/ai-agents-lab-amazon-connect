// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useMemo, useEffect } from "react";

export interface ZoomState {
  pixelsPerMs: number;
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  handleWheel: (e: WheelEvent) => void;
}

/**
 * Hook managing pixelsPerMs zoom state with 2× steps.
 *
 * Min zoom: entire session fits in container (containerWidth / durationMs).
 * Max zoom: 100ms fills the container (containerWidth / 100).
 *
 * @param containerWidth - Current container width in pixels
 * @param durationMs - Total session duration in milliseconds
 */
export function useZoom(containerWidth: number, durationMs: number): ZoomState {
  const minZoom = useMemo(() => {
    if (durationMs <= 0 || containerWidth <= 0) return 1;
    return containerWidth / durationMs;
  }, [containerWidth, durationMs]);

  const maxZoom = useMemo(() => {
    if (containerWidth <= 0) return 1;
    return containerWidth / 100;
  }, [containerWidth]);

  const [pixelsPerMs, setPixelsPerMs] = useState<number>(() => minZoom);

  // Reset to fit-all (minZoom) when the session duration changes
  useEffect(() => {
    setPixelsPerMs(minZoom);
  }, [minZoom]);

  // Clamp value within bounds
  const clamp = useCallback(
    (value: number): number => Math.min(maxZoom, Math.max(minZoom, value)),
    [minZoom, maxZoom]
  );

  const canZoomIn = pixelsPerMs < maxZoom;
  const canZoomOut = pixelsPerMs > minZoom;

  const zoomIn = useCallback(() => {
    setPixelsPerMs((current) => clamp(current * 2));
  }, [clamp]);

  const zoomOut = useCallback(() => {
    setPixelsPerMs((current) => clamp(current / 2));
  }, [clamp]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();

      if (e.deltaY < 0) {
        // Scroll up → zoom in
        setPixelsPerMs((current) => clamp(current * 2));
      } else if (e.deltaY > 0) {
        // Scroll down → zoom out
        setPixelsPerMs((current) => clamp(current / 2));
      }
    },
    [clamp]
  );

  return {
    pixelsPerMs: clamp(pixelsPerMs),
    zoomIn,
    zoomOut,
    canZoomIn,
    canZoomOut,
    handleWheel,
  };
}
