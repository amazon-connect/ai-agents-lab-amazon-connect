// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import type { TimeScale } from "./time-scale";

export interface TimeAxisProps {
  /** Computed time scale with tick positions and total width */
  timeScale: TimeScale;
  /** Height of the time axis area in pixels */
  height?: number;
}

const TICK_HEIGHT = 6;
const LABEL_OFFSET_Y = 16;
const BASELINE_Y = 0;

/**
 * Renders the horizontal time axis with tick marks and labels.
 * Uses Cloudscape design tokens via CSS custom properties.
 */
export const TimeAxis: React.FC<TimeAxisProps> = ({
  timeScale,
  height: _height = 28,
}) => {
  const { ticks, totalWidth } = timeScale;

  return (
    <g className="waterfall-time-axis" data-testid="time-axis">
      {/* Horizontal baseline */}
      <line
        x1={0}
        y1={BASELINE_Y}
        x2={totalWidth}
        y2={BASELINE_Y}
        stroke="var(--color-border-divider-default)"
        strokeWidth={1}
      />

      {/* Tick marks and labels */}
      {ticks.map((tick, index) => (
        <g key={tick.timeMs}>
          {/* Vertical tick mark */}
          <line
            x1={tick.x}
            y1={BASELINE_Y}
            x2={tick.x}
            y2={BASELINE_Y + TICK_HEIGHT}
            stroke="var(--color-border-divider-default)"
            strokeWidth={1}
          />
          {/* Time label */}
          <text
            x={tick.x}
            y={BASELINE_Y + LABEL_OFFSET_Y}
            textAnchor={index === 0 ? "start" : "middle"}
            fill="var(--color-text-body-secondary)"
            fontFamily="var(--font-family-base)"
            fontSize={11}
          >
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  );
};
