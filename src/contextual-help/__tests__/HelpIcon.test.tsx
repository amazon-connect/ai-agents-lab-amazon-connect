// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpIcon } from "../HelpIcon";
import type * as SplitPanelContextModule from "../../layouts/SplitPanelContext";

/**
 * Unit tests for HelpIcon
 * Requirements: 1.1–1.4
 */

// Mock useContextualHelp so we don't need a full SplitPanelProvider tree
const mockOpenHelp = vi.fn();

vi.mock("../../layouts/SplitPanelContext", async (importOriginal) => {
  const actual = await importOriginal<typeof SplitPanelContextModule>();
  return {
    ...actual,
    useContextualHelp: () => ({
      openHelp: mockOpenHelp,
      closeHelp: vi.fn(),
      isHelpOpen: false,
    }),
  };
});

function renderHelpIcon(props?: Partial<React.ComponentProps<typeof HelpIcon>>) {
  return render(
    <HelpIcon
      anchorId="test-anchor"
      pageId="test-page"
      fieldName="Test Field"
      {...props}
    />
  );
}

describe("HelpIcon", () => {
  it("renders a button element (is focusable)", () => {
    renderHelpIcon();
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('has title="Learn more" for the browser tooltip', () => {
    renderHelpIcon();
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Learn more");
  });

  it('has aria-label "Help for {fieldName}"', () => {
    renderHelpIcon({ fieldName: "AI Agent" });
    const button = screen.getByRole("button", { name: "Help for AI Agent" });
    expect(button).toBeInTheDocument();
  });

  it("renders the Cloudscape Icon inside the button", () => {
    renderHelpIcon();
    const button = screen.getByRole("button");
    // Cloudscape Icon renders SVG or a span with icon class inside the button
    expect(button.firstChild).toBeTruthy();
  });

  it("calls openHelp with anchorId and pageId when clicked", () => {
    mockOpenHelp.mockClear();
    renderHelpIcon({ anchorId: "my-anchor", pageId: "my-page" });
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(mockOpenHelp).toHaveBeenCalledOnce();
    expect(mockOpenHelp).toHaveBeenCalledWith("my-anchor", "my-page");
  });

  it("calls openHelp when Enter key is pressed", () => {
    mockOpenHelp.mockClear();
    renderHelpIcon({ anchorId: "enter-anchor", pageId: "enter-page" });
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "Enter" });
    expect(mockOpenHelp).toHaveBeenCalledWith("enter-anchor", "enter-page");
  });

  it("calls openHelp when Space key is pressed", () => {
    mockOpenHelp.mockClear();
    renderHelpIcon({ anchorId: "space-anchor", pageId: "space-page" });
    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: " " });
    expect(mockOpenHelp).toHaveBeenCalledWith("space-anchor", "space-page");
  });
});
