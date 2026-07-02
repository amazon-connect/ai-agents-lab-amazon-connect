// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";

/**
 * Legend entry describing a span type's visual representation.
 */
interface LegendEntry {
  label: string;
  fill: string;
  borderStyle: string;
  borderWidth: string;
}

const LEGEND_ENTRIES: LegendEntry[] = [
  {
    label: "Agent Invocation",
    fill: "#0972d3",
    borderStyle: "solid",
    borderWidth: "1px",
  },
  {
    label: "Inference",
    fill: "#9469d6",
    borderStyle: "solid",
    borderWidth: "1px",
  },
  {
    label: "Tool Execution",
    fill: "#e07941",
    borderStyle: "solid",
    borderWidth: "1px",
  },
  {
    label: "Error",
    fill: "#d91515",
    borderStyle: "solid",
    borderWidth: "2px",
  },
];

const SWATCH_WIDTH = 16;
const SWATCH_HEIGHT = 12;

/**
 * Renders the legend showing span type colours with labels and border style indicators.
 * Always visible above the waterfall chart.
 *
 * Uses Cloudscape CSS custom properties for colours and text styling.
 */
export const WaterfallHeader: React.FC = () => {
  return (
    <div
      className="waterfall-header"
      data-testid="waterfall-header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "8px 12px",
        fontFamily: "var(--font-family-base)",
        fontSize: "var(--font-size-body-s)",
        color: "var(--color-text-body-default)",
      }}
    >
      {LEGEND_ENTRIES.map((entry) => (
        <div
          key={entry.label}
          className="waterfall-legend-item"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: `${SWATCH_WIDTH}px`,
              height: `${SWATCH_HEIGHT}px`,
              backgroundColor: entry.fill,
              borderStyle: entry.borderStyle,
              borderWidth: entry.borderWidth,
              borderColor: entry.fill,
              borderRadius: "2px",
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span>{entry.label}</span>
        </div>
      ))}
    </div>
  );
};
