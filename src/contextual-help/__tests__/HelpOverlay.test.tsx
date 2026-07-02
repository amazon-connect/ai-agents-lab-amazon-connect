// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpOverlay } from "../HelpOverlay";
import { HELP_REGISTRY } from "../help-registry";

/**
 * Unit tests for HelpOverlay
 * Requirements: 4.1–4.8
 */

// ---------------------------------------------------------------------------
// Mock Cloudscape components
// ---------------------------------------------------------------------------
// SplitPanel: render header prop as text and expose onToggle via a test button
vi.mock("@cloudscape-design/components/split-panel", () => ({
  default: ({
    header,
    children,
  }: {
    header: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="split-panel">
      <div data-testid="split-panel-header">{header}</div>
      {children}
    </div>
  ),
}));

// HelpPanel: render header and children
vi.mock("@cloudscape-design/components/help-panel", () => ({
  default: ({
    header,
    children,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="help-panel">
      <div data-testid="help-panel-header">{header}</div>
      {children}
    </div>
  ),
}));

// Button: render a real button with ariaLabel and onClick
vi.mock("@cloudscape-design/components/button", () => ({
  default: ({
    onClick,
    ariaLabel,
    children,
  }: {
    onClick?: () => void;
    ariaLabel?: string;
    children?: React.ReactNode;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}));

// Box: render children in a div with a data-variant attribute
vi.mock("@cloudscape-design/components/box", () => ({
  default: ({
    variant,
    children,
  }: {
    variant?: string;
    children?: React.ReactNode;
  }) => <div data-variant={variant}>{children}</div>,
}));

// SpaceBetween: render children in a div
vi.mock("@cloudscape-design/components/space-between", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Link: render an anchor
vi.mock("@cloudscape-design/components/link", () => ({
  default: ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderOverlay(
  props?: Partial<React.ComponentProps<typeof HelpOverlay>>
) {
  const result = render(
    <HelpOverlay
      anchorId="ai-agent"
      pageId="testing"
      {...props}
    />
  );
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HelpOverlay", () => {
  // Requirement 4.1
  it('renders SplitPanel with header="Help"', () => {
    renderOverlay();
    expect(screen.getByTestId("split-panel-header")).toHaveTextContent("Help");
  });

  // Requirement 4.2 / 4.3 — anchored entry renders with heading and body
  it("renders the anchored HelpEntry section with a visible heading", () => {
    renderOverlay({ anchorId: "ai-agent", pageId: "testing" });
    const entry = HELP_REGISTRY["testing"].find((e) => e.id === "ai-agent")!;
    expect(screen.getByText(entry.title)).toBeInTheDocument();
  });

  it("renders the anchored HelpEntry body paragraphs", () => {
    renderOverlay({ anchorId: "ai-agent", pageId: "testing" });
    const entry = HELP_REGISTRY["testing"].find((e) => e.id === "ai-agent")!;
    for (const paragraph of entry.body) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
  });

  // Requirement 4.3 — all entries for the page are rendered
  it("renders all HelpEntry sections for the page", () => {
    renderOverlay({ anchorId: "ai-agent", pageId: "testing" });
    for (const entry of HELP_REGISTRY["testing"]) {
      expect(screen.getByText(entry.title)).toBeInTheDocument();
    }
  });

  // Requirement 4.8 — entries with links render them
  it("renders external links for entries that have them", () => {
    renderOverlay({ anchorId: "script-yaml", pageId: "testing" });
    const entry = HELP_REGISTRY["testing"].find((e) => e.id === "script-yaml")!;
    for (const link of entry.links ?? []) {
      expect(screen.getByText(link.text)).toBeInTheDocument();
    }
  });

  // Requirement 4.2 — anchored entry appears before remaining entries
  it("renders the anchored entry before all other entries", () => {
    renderOverlay({ anchorId: "latency-chart", pageId: "testing" });
    const entries = HELP_REGISTRY["testing"];
    const anchoredEntry = entries.find((e) => e.id === "latency-chart")!;
    const otherEntries = entries.filter((e) => e.id !== "latency-chart");

    const anchoredEl = screen.getByText(anchoredEntry.title);
    for (const other of otherEntries) {
      const otherEl = screen.getByText(other.title);
      // The anchored entry's DOM node should appear before the other entry's node
      expect(
        anchoredEl.compareDocumentPosition(otherEl) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  // Graceful handling — unknown pageId renders without crashing
  it("renders without crashing when pageId is not in the registry", () => {
    renderOverlay({ anchorId: "anything", pageId: "unknown-page" });
    expect(screen.getByTestId("split-panel-header")).toHaveTextContent("Help");
  });
});

// ---------------------------------------------------------------------------
// Property 6: Stable entry order regardless of anchor
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 9.5**
 *
 * For any pageId in HELP_REGISTRY and any two different anchorId values A and B
 * both present in that page's entries, the relative order of all non-anchored
 * entries SHALL be the same whether HelpOverlay is rendered with anchor A or B.
 */
describe("HelpOverlay — Property 6: stable entry order regardless of anchor", () => {
  /**
   * Helper: render HelpOverlay and return the ordered list of entry titles
   * as they appear in the DOM (using data-variant="h3" divs from the Box mock).
   */
  function getRenderedTitleOrder(pageId: string, anchorId: string): string[] {
    const { container, unmount } = render(
      <HelpOverlay anchorId={anchorId} pageId={pageId} />
    );
    // The Box mock renders <div data-variant="h3"> for entry headings
    const headingDivs = container.querySelectorAll('[data-variant="h3"]');
    const titles = Array.from(headingDivs).map((el) => el.textContent ?? "");
    unmount();
    return titles;
  }

  // Build all (pageId, anchorIdA, anchorIdB) triples for pages with ≥ 2 entries
  const triples: Array<{ pageId: string; anchorIdA: string; anchorIdB: string }> = [];
  for (const pageId of Object.keys(HELP_REGISTRY)) {
    const entries = HELP_REGISTRY[pageId]!;
    if (entries.length < 2) continue;
    for (let i = 0; i < entries.length; i++) {
      for (let j = 0; j < entries.length; j++) {
        if (i !== j) {
          triples.push({
            pageId,
            anchorIdA: entries[i]!.id,
            anchorIdB: entries[j]!.id,
          });
        }
      }
    }
  }

  it("has pages with at least 2 entries to exercise the property", () => {
    expect(triples.length).toBeGreaterThan(0);
  });

  it(
    "non-anchored entries appear in the same relative order regardless of which anchor is active",
    () => {
      for (const { pageId, anchorIdA, anchorIdB } of triples) {
        const pageEntries = HELP_REGISTRY[pageId]!;
        const anchorATitle = pageEntries.find((e) => e.id === anchorIdA)?.title ?? "";
        const anchorBTitle = pageEntries.find((e) => e.id === anchorIdB)?.title ?? "";

        // Render with anchor A — titles in DOM order, excluding anchor A
        const titlesWithAnchorA = getRenderedTitleOrder(pageId, anchorIdA);
        const nonAnchoredWithAnchorA = titlesWithAnchorA.filter((t) => t !== anchorATitle);

        // Render with anchor B — titles in DOM order, excluding anchor B
        const titlesWithAnchorB = getRenderedTitleOrder(pageId, anchorIdB);
        const nonAnchoredWithAnchorB = titlesWithAnchorB.filter((t) => t !== anchorBTitle);

        // Entries that are non-anchored in BOTH renders (neither A nor B)
        const sharedFromA = nonAnchoredWithAnchorA.filter((t) => t !== anchorBTitle);
        const sharedFromB = nonAnchoredWithAnchorB.filter((t) => t !== anchorATitle);

        // The shared entries must appear in the same relative order
        expect(sharedFromA).toEqual(sharedFromB);
      }
    }
  );

  it(
    "non-anchored entries follow registry order (relative order matches HELP_REGISTRY definition)",
    () => {
      for (const { pageId, anchorIdA } of triples) {
        const pageEntries = HELP_REGISTRY[pageId]!;
        const anchorATitle = pageEntries.find((e) => e.id === anchorIdA)?.title ?? "";

        // Expected: registry order minus the anchored entry
        const expectedNonAnchoredOrder = pageEntries
          .filter((e) => e.id !== anchorIdA)
          .map((e) => e.title);

        const renderedTitles = getRenderedTitleOrder(pageId, anchorIdA);
        // Non-anchored = all rendered titles except the anchor title
        const nonAnchoredTitles = renderedTitles.filter((t) => t !== anchorATitle);

        expect(nonAnchoredTitles).toEqual(expectedNonAnchoredOrder);
      }
    }
  );
});
