// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import type { SpanColour } from "./span-colours";

export interface SpanBarProps {
  /** Horizontal position (pixels from left) */
  x: number;
  /** Vertical position (pixels from top) */
  y: number;
  /** Bar width in pixels */
  width: number;
  /** Bar height in pixels */
  height?: number;
  /** Colour configuration from span-colours.ts */
  colour: SpanColour;
  /** Whether this bar is currently selected */
  isSelected: boolean;
  /** Click handler for selection */
  onClick: () => void;
  /** Span ID for accessibility */
  spanId: string;
}

/**
 * Converts a CSS border style to an SVG strokeDasharray value.
 */
function borderStyleToDasharray(
  borderStyle: string
): string | undefined {
  switch (borderStyle) {
    case "dashed":
      return "4 2";
    case "dotted":
      return "1 2";
    default:
      return undefined;
  }
}

/**
 * Renders an SVG rect representing a single span bar in the waterfall.
 *
 * Supports keyboard and pointer interaction for selection, and uses
 * a secondary visual indicator (border style) alongside colour for
 * accessibility (colour-blind users).
 *
 * When selected, renders a 2px contrasting outline using a Cloudscape
 * focus token colour.
 */
export const SpanBar: React.FC<SpanBarProps> = ({
  x,
  y,
  width,
  height = 20,
  colour,
  isSelected,
  onClick,
  spanId,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const dasharray = borderStyleToDasharray(colour.borderStyle);
  const borderWidth = parseFloat(colour.borderWidth) || 1;

  return (
    <g
      className="waterfall-span-bar"
      data-testid={`span-bar-${spanId}`}
      role="button"
      tabIndex={0}
      aria-label={`Span ${spanId}`}
      aria-pressed={isSelected}
      style={{ cursor: "pointer" }}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {/* Selection outline — rendered behind the bar */}
      {isSelected && (
        <rect
          x={x - 2}
          y={y - 2}
          width={width + 4}
          height={height + 4}
          rx={3}
          ry={3}
          fill="none"
          stroke="var(--color-border-control-focus)"
          strokeWidth={2}
          data-testid={`span-bar-outline-${spanId}`}
        />
      )}

      {/* Main span bar */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        ry={2}
        style={{
          fill: colour.fill,
          stroke: colour.border,
          strokeWidth: borderWidth,
          strokeDasharray: dasharray,
        }}
      />
    </g>
  );
};
