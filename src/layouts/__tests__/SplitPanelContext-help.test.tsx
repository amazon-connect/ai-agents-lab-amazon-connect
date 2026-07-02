// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Property-based tests for SplitPanelContext help mode.
 *
 * **Validates: Requirements 3.2, 3.3, 4.5, 4.6**
 *
 * Property 3: openHelp then closeHelp restores previous SplitPanel config
 *
 * For any SplitPanelConfig that is active before openHelp is called,
 * calling openHelp(anchorId, pageId) followed by closeHelp() SHALL restore
 * the SplitPanelContext config to that original value (or null if no config
 * was active).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as fc from "fast-check";
import React from "react";
import {
  SplitPanelProvider,
  useSplitPanelControl,
  useSplitPanelConfig,
  useContextualHelp,
} from "../SplitPanelContext";
import type { SplitPanelConfig } from "../SplitPanelContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrapper that provides the SplitPanelContext to hooks under test */
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SplitPanelProvider, null, children);
}

/**
 * Build a SplitPanelConfig from serialisable parts so fast-check can vary
 * the meaningful fields (open, preferences.position) while keeping the
 * function callbacks and panel element stable and identity-comparable.
 */
function makeConfig(
  open: boolean,
  position: "side" | "bottom",
  panelLabel: string
): SplitPanelConfig {
  const onPreferencesChange = () => {};
  const onToggle = () => {};
  const panel = React.createElement("div", { "data-testid": panelLabel });
  return { panel, open, preferences: { position }, onPreferencesChange, onToggle };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid anchorId from the testing page registry */
const anchorIdArb = fc.constantFrom(
  "ai-agent",
  "script-yaml",
  "iteration-count",
  "concurrency"
);

/** Generates a valid pageId */
const pageIdArb = fc.constant("testing");

/** Generates a SplitPanelConfig with varied open flag and panel position */
const splitPanelConfigArb = fc
  .tuple(
    fc.boolean(),
    fc.constantFrom("side" as const, "bottom" as const),
    fc.string({ minLength: 1, maxLength: 20 })
  )
  .map(([open, position, label]) => makeConfig(open, position, label));

// ---------------------------------------------------------------------------
// Property 3: openHelp → closeHelp restores config
// ---------------------------------------------------------------------------

describe("Property 3: openHelp then closeHelp restores previous SplitPanel config", () => {
  it("restores a non-null config after openHelp → closeHelp", () => {
    fc.assert(
      fc.property(
        splitPanelConfigArb,
        anchorIdArb,
        pageIdArb,
        (originalConfig, anchorId, pageId) => {
          const { result } = renderHook(
            () => ({
              control: useSplitPanelControl(),
              config: useSplitPanelConfig(),
              help: useContextualHelp(),
            }),
            { wrapper }
          );

          // 1. Set the initial config
          act(() => {
            result.current.control.setConfig(originalConfig);
          });

          // Confirm config is set
          expect(result.current.config).toBe(originalConfig);

          // 2. Open help — this should snapshot the current config
          act(() => {
            result.current.help.openHelp(anchorId, pageId);
          });

          expect(result.current.help.isHelpOpen).toBe(true);

          // 3. Close help — config should be restored to originalConfig
          act(() => {
            result.current.help.closeHelp();
          });

          expect(result.current.help.isHelpOpen).toBe(false);
          expect(result.current.config).toBe(originalConfig);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("restores null config (no panel was open) after openHelp → closeHelp", () => {
    fc.assert(
      fc.property(anchorIdArb, pageIdArb, (anchorId, pageId) => {
        const { result } = renderHook(
          () => ({
            config: useSplitPanelConfig(),
            help: useContextualHelp(),
          }),
          { wrapper }
        );

        // Config starts as null (no panel registered)
        expect(result.current.config).toBeNull();

        // Open help
        act(() => {
          result.current.help.openHelp(anchorId, pageId);
        });

        expect(result.current.help.isHelpOpen).toBe(true);

        // Close help — should restore to null
        act(() => {
          result.current.help.closeHelp();
        });

        expect(result.current.help.isHelpOpen).toBe(false);
        expect(result.current.config).toBeNull();
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Double openHelp preserves original snapshot
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 3.4**
 *
 * For any two distinct anchorId values A and B, calling openHelp(A, pageId)
 * then openHelp(B, pageId) SHALL preserve the PreviousPanelSnapshot captured
 * at the first call, so that closeHelp() restores to the config that was
 * active before openHelp(A, pageId).
 */
describe("Property 4: Double openHelp preserves original snapshot", () => {
  it("closeHelp restores to config before first openHelp, even after a second openHelp", () => {
    fc.assert(
      fc.property(
        splitPanelConfigArb,
        // Two distinct anchorIds from the testing page
        fc.tuple(anchorIdArb, anchorIdArb).filter(([a, b]) => a !== b),
        pageIdArb,
        (originalConfig, [anchorIdA, anchorIdB], pageId) => {
          const { result } = renderHook(
            () => ({
              control: useSplitPanelControl(),
              config: useSplitPanelConfig(),
              help: useContextualHelp(),
            }),
            { wrapper }
          );

          // 1. Set the initial config (the "original" state before any help opens)
          act(() => {
            result.current.control.setConfig(originalConfig);
          });

          expect(result.current.config).toBe(originalConfig);

          // 2. First openHelp — snapshots originalConfig
          act(() => {
            result.current.help.openHelp(anchorIdA, pageId);
          });

          expect(result.current.help.isHelpOpen).toBe(true);

          // 3. Second openHelp — must NOT replace the snapshot
          act(() => {
            result.current.help.openHelp(anchorIdB, pageId);
          });

          expect(result.current.help.isHelpOpen).toBe(true);

          // 4. closeHelp must restore to originalConfig (before the FIRST openHelp)
          act(() => {
            result.current.help.closeHelp();
          });

          expect(result.current.help.isHelpOpen).toBe(false);
          expect(result.current.config).toBe(originalConfig);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("closeHelp restores to null when no config was set before first openHelp", () => {
    fc.assert(
      fc.property(
        // Two distinct anchorIds
        fc.tuple(anchorIdArb, anchorIdArb).filter(([a, b]) => a !== b),
        pageIdArb,
        ([anchorIdA, anchorIdB], pageId) => {
          const { result } = renderHook(
            () => ({
              config: useSplitPanelConfig(),
              help: useContextualHelp(),
            }),
            { wrapper }
          );

          // No initial config — starts as null

          // First openHelp
          act(() => {
            result.current.help.openHelp(anchorIdA, pageId);
          });

          // Second openHelp
          act(() => {
            result.current.help.openHelp(anchorIdB, pageId);
          });

          // closeHelp should restore to null (the state before the first openHelp)
          act(() => {
            result.current.help.closeHelp();
          });

          expect(result.current.help.isHelpOpen).toBe(false);
          expect(result.current.config).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for SplitPanelContext help mode (task 2.4)
// Requirements: 3.1–3.6, 9.3, 9.4
// ---------------------------------------------------------------------------

describe("Unit tests: SplitPanelContext help mode", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // Requirement 3.1, 3.5
  it("openHelp sets isHelpOpen to true", () => {
    const { result } = renderHook(() => useContextualHelp(), { wrapper });

    expect(result.current.isHelpOpen).toBe(false);

    act(() => {
      result.current.openHelp("ai-agent", "testing");
    });

    expect(result.current.isHelpOpen).toBe(true);
  });

  // Requirement 3.2, 3.5
  it("closeHelp sets isHelpOpen to false", () => {
    const { result } = renderHook(() => useContextualHelp(), { wrapper });

    act(() => {
      result.current.openHelp("ai-agent", "testing");
    });
    expect(result.current.isHelpOpen).toBe(true);

    act(() => {
      result.current.closeHelp();
    });

    expect(result.current.isHelpOpen).toBe(false);
  });

  // Requirement 9.3
  it("openHelp with unknown pageId logs a console warning", () => {
    const { result } = renderHook(() => useContextualHelp(), { wrapper });

    act(() => {
      result.current.openHelp("some-anchor", "unknown-page");
    });

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown pageId "unknown-page"')
    );
  });

  // Requirement 9.4
  it("openHelp with unknown anchorId logs a console warning", () => {
    const { result } = renderHook(() => useContextualHelp(), { wrapper });

    act(() => {
      result.current.openHelp("nonexistent-anchor", "testing");
    });

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown anchorId "nonexistent-anchor"')
    );
  });

  // Sanity: no warning for a valid (pageId, anchorId) pair
  it("openHelp with a valid pageId and anchorId does not log a warning", () => {
    const { result } = renderHook(() => useContextualHelp(), { wrapper });

    act(() => {
      result.current.openHelp("ai-agent", "testing");
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
