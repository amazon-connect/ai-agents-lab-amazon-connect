// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Maps span types to Cloudscape design token colours and border styles.
 *
 * Each span type gets a distinct fill colour and border style to ensure
 * both colour and non-colour differentiation (accessibility for colour-blind users).
 *
 * When a span has a non-OK status, the error colour overrides the type-based colour.
 */

/** Colour configuration for a span type */
export interface SpanColour {
  fill: string;        // CSS custom property reference
  border: string;      // CSS custom property reference
  borderStyle: string; // "solid" | "dashed" | "dotted"
  borderWidth: string; // e.g. "1px" or "2px"
}

const SPAN_COLOURS: Record<string, SpanColour> = {
  invoke_agent: {
    fill: "#0972d3",
    border: "#0972d3",
    borderStyle: "solid",
    borderWidth: "1px",
  },
  inference: {
    fill: "#9469d6",
    border: "#9469d6",
    borderStyle: "solid",
    borderWidth: "1px",
  },
  execute_tool: {
    fill: "#e07941",
    border: "#e07941",
    borderStyle: "solid",
    borderWidth: "1px",
  },
};

const UNKNOWN_COLOUR: SpanColour = {
  fill: "#687078",
  border: "#687078",
  borderStyle: "solid",
  borderWidth: "1px",
};

const ERROR_COLOUR: SpanColour = {
  fill: "#d91515",
  border: "#d91515",
  borderStyle: "solid",
  borderWidth: "2px",
};

/**
 * Returns the colour configuration for a span based on its type and status.
 *
 * If status is not "OK", the error colour (red, solid 2px border) is returned
 * regardless of span type. Otherwise, the colour is determined by spanName,
 * falling back to a neutral colour for unknown types.
 */
export function getSpanColour(spanName: string, status: string): SpanColour {
  if (status !== "OK") {
    return ERROR_COLOUR;
  }

  return SPAN_COLOURS[spanName] ?? UNKNOWN_COLOUR;
}
