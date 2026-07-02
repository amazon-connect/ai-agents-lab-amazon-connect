// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useContainerResize } from '../useContainerResize';

describe('useContainerResize', () => {
  let observeCallback: ResizeObserverCallback;
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockObserve = vi.fn();
    mockDisconnect = vi.fn();

    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        observeCallback = callback;
      }
      observe = mockObserve;
      disconnect = mockDisconnect;
      unobserve = vi.fn();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns 0 when ref is null', () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      return useContainerResize(ref);
    });

    expect(result.current).toBe(0);
  });

  it('returns initial width from getBoundingClientRect', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
    });

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(element);
      return useContainerResize(ref);
    });

    expect(result.current).toBe(800);
    expect(mockObserve).toHaveBeenCalledWith(element);
  });

  it('debounces resize events at 150ms', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
    });

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(element);
      return useContainerResize(ref);
    });

    // Simulate resize events
    act(() => {
      observeCallback(
        [{ contentRect: { width: 900 } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    // Width should not update immediately
    expect(result.current).toBe(800);

    // Fire another resize before debounce completes
    act(() => {
      vi.advanceTimersByTime(100);
      observeCallback(
        [{ contentRect: { width: 1000 } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    // Still debouncing
    expect(result.current).toBe(800);

    // Advance past debounce threshold
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Should use the latest value
    expect(result.current).toBe(1000);
  });

  it('uses contentBoxSize when available', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
    });

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(element);
      return useContainerResize(ref);
    });

    act(() => {
      observeCallback(
        [{
          contentBoxSize: [{ inlineSize: 950, blockSize: 600 }],
          contentRect: { width: 900 },
        } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Should prefer contentBoxSize.inlineSize
    expect(result.current).toBe(950);
  });

  it('cleans up observer on unmount', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
    });

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(element);
      return useContainerResize(ref);
    });

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('clears pending timeout on unmount', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
    });

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(element);
      return useContainerResize(ref);
    });

    // Trigger a resize to create a pending timeout
    act(() => {
      observeCallback(
        [{ contentRect: { width: 900 } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    // Unmount before debounce completes
    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
    // No error should occur when timer would have fired
    act(() => {
      vi.advanceTimersByTime(200);
    });
  });
});
