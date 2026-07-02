// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Observes a container element via ResizeObserver and returns its current width.
 * Resize events are debounced at 150ms to avoid excessive re-renders.
 *
 * @param containerRef - React ref to the container element to observe
 * @returns The current container width in pixels (0 if not yet measured)
 */
export function useContainerResize(containerRef: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Set initial width
    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      // Debounce resize events at 150ms
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        for (const entry of entries) {
          const contentWidth = entry.contentBoxSize?.[0]?.inlineSize
            ?? entry.contentRect.width;
          setWidth(contentWidth);
        }
        timeoutRef.current = null;
      }, 150);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [containerRef]);

  return width;
}
