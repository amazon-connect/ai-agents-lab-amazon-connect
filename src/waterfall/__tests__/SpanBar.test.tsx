// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SpanBar } from "../SpanBar";
import type { SpanColour } from "../span-colours";

const solidColour: SpanColour = {
  fill: "var(--color-charts-palette-categorical-1)",
  border: "var(--color-charts-palette-categorical-1)",
  borderStyle: "solid",
  borderWidth: "1px",
};

const dashedColour: SpanColour = {
  fill: "var(--color-charts-palette-categorical-2)",
  border: "var(--color-charts-palette-categorical-2)",
  borderStyle: "dashed",
  borderWidth: "1px",
};

const dottedColour: SpanColour = {
  fill: "var(--color-charts-palette-categorical-3)",
  border: "var(--color-charts-palette-categorical-3)",
  borderStyle: "dotted",
  borderWidth: "1px",
};

function renderSpanBar(props: Partial<React.ComponentProps<typeof SpanBar>> = {}) {
  const defaultProps: React.ComponentProps<typeof SpanBar> = {
    x: 10,
    y: 5,
    width: 100,
    colour: solidColour,
    isSelected: false,
    onClick: vi.fn(),
    spanId: "span-123",
    ...props,
  };

  return render(
    <svg>
      <SpanBar {...defaultProps} />
    </svg>
  );
}

describe("SpanBar", () => {
  it("renders a rect with correct position and dimensions", () => {
    renderSpanBar({ x: 20, y: 10, width: 150, height: 24 });

    const bar = screen.getByTestId("span-bar-span-123");
    const rect = bar.querySelector("rect:not([data-testid])") as SVGRectElement;

    expect(rect).toBeTruthy();
    expect(rect.getAttribute("x")).toBe("20");
    expect(rect.getAttribute("y")).toBe("10");
    expect(rect.getAttribute("width")).toBe("150");
    expect(rect.getAttribute("height")).toBe("24");
  });

  it("uses default height of 20px when not specified", () => {
    renderSpanBar({ x: 0, y: 0, width: 80 });

    const bar = screen.getByTestId("span-bar-span-123");
    const rect = bar.querySelector("rect:not([data-testid])") as SVGRectElement;

    expect(rect.getAttribute("height")).toBe("20");
  });

  it("applies fill and border colour from SpanColour", () => {
    renderSpanBar({ colour: dashedColour });

    const bar = screen.getByTestId("span-bar-span-123");
    const rect = bar.querySelector("rect:not([data-testid])") as SVGRectElement;

    expect(rect.style.fill).toBe("var(--color-charts-palette-categorical-2)");
    expect(rect.style.stroke).toBe("var(--color-charts-palette-categorical-2)");
  });

  it("renders solid border style without strokeDasharray", () => {
    renderSpanBar({ colour: solidColour });

    const bar = screen.getByTestId("span-bar-span-123");
    const rect = bar.querySelector("rect:not([data-testid])") as SVGRectElement;

    expect(rect.style.strokeDasharray).toBe("");
  });

  it('renders dashed border style with strokeDasharray="4 2"', () => {
    renderSpanBar({ colour: dashedColour });

    const bar = screen.getByTestId("span-bar-span-123");
    const rect = bar.querySelector("rect:not([data-testid])") as SVGRectElement;

    expect(rect.style.strokeDasharray).toBe("4 2");
  });

  it('renders dotted border style with strokeDasharray="1 2"', () => {
    renderSpanBar({ colour: dottedColour });

    const bar = screen.getByTestId("span-bar-span-123");
    const rect = bar.querySelector("rect:not([data-testid])") as SVGRectElement;

    expect(rect.style.strokeDasharray).toBe("1 2");
  });

  it("is focusable with role=button and tabIndex=0", () => {
    renderSpanBar();

    const bar = screen.getByTestId("span-bar-span-123");

    expect(bar.getAttribute("role")).toBe("button");
    expect(bar.getAttribute("tabindex")).toBe("0");
  });

  it("has an accessible label including the span ID", () => {
    renderSpanBar({ spanId: "my-span-42" });

    const bar = screen.getByTestId("span-bar-my-span-42");
    expect(bar.getAttribute("aria-label")).toBe("Span my-span-42");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    renderSpanBar({ onClick });

    const bar = screen.getByTestId("span-bar-span-123");
    fireEvent.click(bar);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onClick when Enter key is pressed", () => {
    const onClick = vi.fn();
    renderSpanBar({ onClick });

    const bar = screen.getByTestId("span-bar-span-123");
    fireEvent.keyDown(bar, { key: "Enter" });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onClick when Space key is pressed", () => {
    const onClick = vi.fn();
    renderSpanBar({ onClick });

    const bar = screen.getByTestId("span-bar-span-123");
    fireEvent.keyDown(bar, { key: " " });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not call onClick for other keys", () => {
    const onClick = vi.fn();
    renderSpanBar({ onClick });

    const bar = screen.getByTestId("span-bar-span-123");
    fireEvent.keyDown(bar, { key: "Tab" });
    fireEvent.keyDown(bar, { key: "Escape" });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not render selection outline when not selected", () => {
    renderSpanBar({ isSelected: false, spanId: "span-abc" });

    const outline = screen.queryByTestId("span-bar-outline-span-abc");
    expect(outline).toBeNull();
  });

  it("renders a 2px selection outline when selected", () => {
    renderSpanBar({ isSelected: true, x: 10, y: 5, width: 100, height: 20, spanId: "span-abc" });

    const outline = screen.getByTestId("span-bar-outline-span-abc");

    expect(outline.getAttribute("stroke")).toBe("var(--color-border-control-focus)");
    expect(outline.getAttribute("stroke-width")).toBe("2");
    // Outline should be 2px larger on each side
    expect(outline.getAttribute("x")).toBe("8");
    expect(outline.getAttribute("y")).toBe("3");
    expect(outline.getAttribute("width")).toBe("104");
    expect(outline.getAttribute("height")).toBe("24");
  });

  it("sets aria-pressed to true when selected", () => {
    renderSpanBar({ isSelected: true });

    const bar = screen.getByTestId("span-bar-span-123");
    expect(bar.getAttribute("aria-pressed")).toBe("true");
  });

  it("sets aria-pressed to false when not selected", () => {
    renderSpanBar({ isSelected: false });

    const bar = screen.getByTestId("span-bar-span-123");
    expect(bar.getAttribute("aria-pressed")).toBe("false");
  });
});
