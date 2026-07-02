// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { HELP_REGISTRY } from "../help-registry";

/** Non-null accessor — Object.keys guarantees the key exists. */
function getPage(pageId: string) {
  return HELP_REGISTRY[pageId]!;
}

/**
 * Property 2: All registered HelpEntry objects have non-empty content
 *
 * Validates: Requirements 2.1–2.15
 */
describe("HELP_REGISTRY content completeness", () => {
  it("has at least one page registered", () => {
    expect(Object.keys(HELP_REGISTRY).length).toBeGreaterThan(0);
  });

  it("every page has at least one entry", () => {
    for (const pageId of Object.keys(HELP_REGISTRY)) {
      expect(
        getPage(pageId).length,
        `page "${pageId}" should have at least one entry`
      ).toBeGreaterThan(0);
    }
  });

  /**
   * **Validates: Requirements 2.1–2.15**
   *
   * Enumerate all (pageId, entryId) pairs and assert:
   *   - title.length > 0
   *   - body.length > 0
   *   - every body[i].length > 0
   */
  it("all (pageId, entryId) pairs have non-empty title and body paragraphs", () => {
    const pairs: Array<{ pageId: string; entryIndex: number }> = [];
    for (const pageId of Object.keys(HELP_REGISTRY)) {
      getPage(pageId).forEach((_, idx) => {
        pairs.push({ pageId, entryIndex: idx });
      });
    }

    fc.assert(
      fc.property(fc.constantFrom(...pairs), ({ pageId, entryIndex }) => {
        const entry = getPage(pageId)[entryIndex]!;

        expect(entry.title.length, `entry "${entry.id}" on page "${pageId}" must have a non-empty title`).toBeGreaterThan(0);
        expect(entry.body.length, `entry "${entry.id}" on page "${pageId}" must have at least one body paragraph`).toBeGreaterThan(0);

        for (let i = 0; i < entry.body.length; i++) {
          expect(
            entry.body[i]!.length,
            `entry "${entry.id}" on page "${pageId}" body[${i}] must be non-empty`
          ).toBeGreaterThan(0);
        }
      }),
      { numRuns: pairs.length * 10 }
    );
  });

  it("all entry ids are unique within their page", () => {
    for (const pageId of Object.keys(HELP_REGISTRY)) {
      const ids = getPage(pageId).map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(
        uniqueIds.size,
        `page "${pageId}" has duplicate entry ids: ${ids.join(", ")}`
      ).toBe(ids.length);
    }
  });
});
