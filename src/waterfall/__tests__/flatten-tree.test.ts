// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { flattenTree } from "../flatten-tree";
import type { Span, SpanNode, SpanTree } from "../../sessions/types";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    spanId: "span-1",
    spanName: "invoke_agent",
    spanType: "SERVER",
    startTimestamp: "2024-01-01T00:00:00.000Z",
    endTimestamp: "2024-01-01T00:00:01.000Z",
    status: "OK",
    originRequestId: "req-1",
    attributes: {},
    ...overrides,
  };
}

function makeNode(span: Span, children: SpanNode[] = []): SpanNode {
  return { span, children };
}

describe("flattenTree", () => {
  it("returns empty array for empty tree", () => {
    const tree: SpanTree = { roots: [], totalCount: 0 };
    expect(flattenTree(tree)).toEqual([]);
  });

  it("returns single row for single root with no children", () => {
    const span = makeSpan({ spanId: "root-1" });
    const tree: SpanTree = {
      roots: [makeNode(span)],
      totalCount: 1,
    };

    const rows = flattenTree(tree);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.span.spanId).toBe("root-1");
    expect(rows[0]!.depth).toBe(0);
    expect(rows[0]!.isFirstInGroup).toBe(true);
  });

  it("flattens parent with children in depth-first order", () => {
    const parent = makeSpan({
      spanId: "parent",
      startTimestamp: "2024-01-01T00:00:00.000Z",
    });
    const child1 = makeSpan({
      spanId: "child-1",
      startTimestamp: "2024-01-01T00:00:00.100Z",
    });
    const child2 = makeSpan({
      spanId: "child-2",
      startTimestamp: "2024-01-01T00:00:00.200Z",
    });

    const tree: SpanTree = {
      roots: [makeNode(parent, [makeNode(child1), makeNode(child2)])],
      totalCount: 3,
    };

    const rows = flattenTree(tree);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.span.spanId).toBe("parent");
    expect(rows[0]!.depth).toBe(0);
    expect(rows[1]!.span.spanId).toBe("child-1");
    expect(rows[1]!.depth).toBe(1);
    expect(rows[2]!.span.spanId).toBe("child-2");
    expect(rows[2]!.depth).toBe(1);
  });

  it("sorts children by startTimestamp ascending", () => {
    const parent = makeSpan({ spanId: "parent" });
    const laterChild = makeSpan({
      spanId: "later",
      startTimestamp: "2024-01-01T00:00:01.000Z",
    });
    const earlierChild = makeSpan({
      spanId: "earlier",
      startTimestamp: "2024-01-01T00:00:00.500Z",
    });

    const tree: SpanTree = {
      roots: [makeNode(parent, [makeNode(laterChild), makeNode(earlierChild)])],
      totalCount: 3,
    };

    const rows = flattenTree(tree);
    expect(rows[1]!.span.spanId).toBe("earlier");
    expect(rows[2]!.span.spanId).toBe("later");
  });

  it("sorts roots by startTimestamp ascending", () => {
    const root2 = makeSpan({
      spanId: "root-2",
      startTimestamp: "2024-01-01T00:00:02.000Z",
    });
    const root1 = makeSpan({
      spanId: "root-1",
      startTimestamp: "2024-01-01T00:00:01.000Z",
    });

    const tree: SpanTree = {
      roots: [makeNode(root2), makeNode(root1)],
      totalCount: 2,
    };

    const rows = flattenTree(tree);
    expect(rows[0]!.span.spanId).toBe("root-1");
    expect(rows[1]!.span.spanId).toBe("root-2");
  });

  it("marks every root as isFirstInGroup (each root starts a new subtree group)", () => {
    const root1 = makeSpan({
      spanId: "root-1",
      startTimestamp: "2024-01-01T00:00:00.000Z",
    });
    const root2 = makeSpan({
      spanId: "root-2",
      startTimestamp: "2024-01-01T00:00:01.000Z",
    });
    const root3 = makeSpan({
      spanId: "root-3",
      startTimestamp: "2024-01-01T00:00:02.000Z",
    });

    const tree: SpanTree = {
      roots: [makeNode(root1), makeNode(root2), makeNode(root3)],
      totalCount: 3,
    };

    const rows = flattenTree(tree);
    expect(rows[0]!.isFirstInGroup).toBe(true);
    expect(rows[1]!.isFirstInGroup).toBe(true);
    expect(rows[2]!.isFirstInGroup).toBe(true);
  });

  it("children never have isFirstInGroup set to true", () => {
    const parent = makeSpan({ spanId: "parent" });
    const child = makeSpan({
      spanId: "child",
      startTimestamp: "2024-01-01T00:00:00.100Z",
    });

    const tree: SpanTree = {
      roots: [makeNode(parent, [makeNode(child)])],
      totalCount: 2,
    };

    const rows = flattenTree(tree);
    expect(rows[1]!.isFirstInGroup).toBe(false);
  });

  it("handles deeply nested tree correctly", () => {
    const grandchild = makeSpan({
      spanId: "grandchild",
      startTimestamp: "2024-01-01T00:00:00.200Z",
    });
    const child = makeSpan({
      spanId: "child",
      startTimestamp: "2024-01-01T00:00:00.100Z",
    });
    const root = makeSpan({
      spanId: "root",
      startTimestamp: "2024-01-01T00:00:00.000Z",
    });

    const tree: SpanTree = {
      roots: [makeNode(root, [makeNode(child, [makeNode(grandchild)])])],
      totalCount: 3,
    };

    const rows = flattenTree(tree);
    expect(rows).toHaveLength(3);
    expect(rows[0]!).toMatchObject({ depth: 0, isFirstInGroup: true });
    expect(rows[1]!).toMatchObject({ depth: 1, isFirstInGroup: false });
    expect(rows[2]!).toMatchObject({ depth: 2, isFirstInGroup: false });
  });

  it("processes multiple roots each with children in correct order", () => {
    const root1 = makeSpan({
      spanId: "root-1",
      startTimestamp: "2024-01-01T00:00:00.000Z",
    });
    const child1 = makeSpan({
      spanId: "child-1",
      startTimestamp: "2024-01-01T00:00:00.100Z",
    });
    const root2 = makeSpan({
      spanId: "root-2",
      startTimestamp: "2024-01-01T00:00:01.000Z",
    });
    const child2 = makeSpan({
      spanId: "child-2",
      startTimestamp: "2024-01-01T00:00:01.100Z",
    });

    const tree: SpanTree = {
      roots: [
        makeNode(root2, [makeNode(child2)]),
        makeNode(root1, [makeNode(child1)]),
      ],
      totalCount: 4,
    };

    const rows = flattenTree(tree);
    expect(rows.map((r) => r.span.spanId)).toEqual([
      "root-1",
      "child-1",
      "root-2",
      "child-2",
    ]);
  });
});
