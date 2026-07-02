// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";

/**
 * InlineLabel renders a text label on or beside a SpanBar in the waterfall SVG.
 *
 * Positioning logic:
 * - If barWidth < 40px and label fits to the right: label is rendered to the right of the bar
 * - If barWidth < 40px and label overflows right edge: label is rendered to the left of the bar
 * - Otherwise: label is rendered inside the bar, clipped with ellipsis via clipPath
 *
 * Uses Cloudscape CSS custom properties for font family and size.
 */

export interface InlineLabelProps {
  /** The text to display */
  label: string;
  /** X position of the bar */
  barX: number;
  /** Width of the bar in pixels */
  barWidth: number;
  /** Y position of the bar */
  barY: number;
  /** Total available width of the SVG container */
  containerWidth?: number;
}

/** Bar height used for vertical centering */
const BAR_HEIGHT = 20;
/** Threshold below which label is positioned outside the bar */
const MIN_BAR_WIDTH_FOR_INSIDE = 40;
/** Horizontal padding inside the bar for the label */
const INSIDE_PADDING = 4;
/** Gap between bar edge and outside label */
const OUTSIDE_GAP = 4;
/** Approximate character width at 11px font for overflow estimation */
const APPROX_CHAR_WIDTH = 6.5;

export const InlineLabel: React.FC<InlineLabelProps> = ({
  label,
  barX,
  barWidth,
  barY,
  containerWidth,
}) => {
  if (!label) {
    return null;
  }

  const textY = barY + BAR_HEIGHT / 2;
  const isOutside = barWidth < MIN_BAR_WIDTH_FOR_INSIDE;

  if (isOutside) {
    const labelWidth = label.length * APPROX_CHAR_WIDTH;
    const rightEdge = barX + barWidth + OUTSIDE_GAP + labelWidth;
    const wouldOverflow = containerWidth != null && rightEdge > containerWidth;

    if (wouldOverflow) {
      // Render to the left of the bar
      return (
        <text
          x={barX - OUTSIDE_GAP}
          y={textY}
          dominantBaseline="central"
          textAnchor="end"
          style={{
            fontFamily: "var(--font-family-base)",
            fontSize: "11px",
            fill: "var(--color-text-body-secondary)",
          }}
        >
          {label}
        </text>
      );
    }

    return (
      <text
        x={barX + barWidth + OUTSIDE_GAP}
        y={textY}
        dominantBaseline="central"
        style={{
          fontFamily: "var(--font-family-base)",
          fontSize: "11px",
          fill: "var(--color-text-body-secondary)",
        }}
      >
        {label}
      </text>
    );
  }

  // Render inside the bar with clipping for overflow/ellipsis
  const clipId = `clip-label-${barX}-${barY}`;
  const maxTextWidth = barWidth - INSIDE_PADDING * 2;

  return (
    <g>
      <clipPath id={clipId}>
        <rect
          x={barX + INSIDE_PADDING}
          y={barY}
          width={maxTextWidth}
          height={BAR_HEIGHT}
        />
      </clipPath>
      <text
        x={barX + INSIDE_PADDING}
        y={textY}
        dominantBaseline="central"
        clipPath={`url(#${clipId})`}
        textLength={undefined}
        style={{
          fontFamily: "var(--font-family-base)",
          fontSize: "11px",
          fill: "var(--color-text-body-default)",
        }}
      >
        {label}
      </text>
    </g>
  );
};
