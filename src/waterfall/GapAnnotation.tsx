// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { formatDuration } from "./format-duration";

export interface GapAnnotationProps {
  /** X position of the gap midpoint (center of the idle period) */
  x: number;
  /** Y position (vertically centered in the group gap) */
  y: number;
  /** Duration of the gap in milliseconds */
  gapMs: number;
}

/**
 * Renders a subtle "idle" annotation in the gap between root-level span groups.
 * Shows the gap duration in muted text with a clock icon.
 */
export const GapAnnotation: React.FC<GapAnnotationProps> = ({ x, y, gapMs }) => {
  const label = `⏱ ${formatDuration(gapMs)} idle`;

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fontFamily: "var(--font-family-base)",
        fontSize: "10px",
        fill: "var(--color-text-body-secondary)",
        opacity: 0.7,
      }}
    >
      {label}
    </text>
  );
};
