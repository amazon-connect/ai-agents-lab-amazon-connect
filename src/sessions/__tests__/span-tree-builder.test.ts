// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { buildSpanTree } from "../span-tree-builder";
import type { Span } from "../types";

function makeSpan(overrides: Partial<Span> & { spanId: string }): Span {
  return {
    spanName: "invoke_agent",
    spanType: "SERVER",
    startTimestamp: "2024-01-01T00:00:00Z",
    endTimestamp: "2024-01-01T00:01:00Z",
    status: "OK",
    originRequestId: "req-1",
    attributes: {},
    ...overrides,
  };
}

describe("buildSpanTree", () => {
  it("returns empty tree for empty input", () => {
    const result = buildSpanTree([]);
    expect(result).toEqual({ roots: [], totalCount: 0 });
  });

  it("places spans without parentSpanId as roots", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "a", startTimestamp: "2024-01-01T00:00:01Z" }),
      makeSpan({ spanId: "b", startTimestamp: "2024-01-01T00:00:02Z" }),
    ];

    const result = buildSpanTree(spans);
    expect(result.roots).toHaveLength(2);
    expect(result.roots[0]!.span.spanId).toBe("a");
    expect(result.roots[1]!.span.spanId).toBe("b");
    expect(result.totalCount).toBe(2);
  });

  it("groups children under their parent", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "root", startTimestamp: "2024-01-01T00:00:00Z" }),
      makeSpan({ spanId: "child1", parentSpanId: "root", startTimestamp: "2024-01-01T00:00:01Z" }),
      makeSpan({ spanId: "child2", parentSpanId: "root", startTimestamp: "2024-01-01T00:00:02Z" }),
    ];

    const result = buildSpanTree(spans);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.span.spanId).toBe("root");
    expect(result.roots[0]!.children).toHaveLength(2);
    expect(result.roots[0]!.children[0]!.span.spanId).toBe("child1");
    expect(result.roots[0]!.children[1]!.span.spanId).toBe("child2");
    expect(result.totalCount).toBe(3);
  });

  it("promotes orphaned spans to root level", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "a", startTimestamp: "2024-01-01T00:00:00Z" }),
      makeSpan({ spanId: "orphan", parentSpanId: "nonexistent", startTimestamp: "2024-01-01T00:00:01Z" }),
    ];

    const result = buildSpanTree(spans);
    expect(result.roots).toHaveLength(2);
    expect(result.roots[0]!.span.spanId).toBe("a");
    expect(result.roots[1]!.span.spanId).toBe("orphan");
    expect(result.totalCount).toBe(2);
  });

  it("sorts roots by startTimestamp ascending", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "c", startTimestamp: "2024-01-01T00:00:03Z" }),
      makeSpan({ spanId: "a", startTimestamp: "2024-01-01T00:00:01Z" }),
      makeSpan({ spanId: "b", startTimestamp: "2024-01-01T00:00:02Z" }),
    ];

    const result = buildSpanTree(spans);
    expect(result.roots[0]!.span.spanId).toBe("a");
    expect(result.roots[1]!.span.spanId).toBe("b");
    expect(result.roots[2]!.span.spanId).toBe("c");
  });

  it("sorts children by startTimestamp ascending", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "root", startTimestamp: "2024-01-01T00:00:00Z" }),
      makeSpan({ spanId: "c", parentSpanId: "root", startTimestamp: "2024-01-01T00:00:03Z" }),
      makeSpan({ spanId: "a", parentSpanId: "root", startTimestamp: "2024-01-01T00:00:01Z" }),
      makeSpan({ spanId: "b", parentSpanId: "root", startTimestamp: "2024-01-01T00:00:02Z" }),
    ];

    const result = buildSpanTree(spans);
    const children = result.roots[0]!.children;
    expect(children[0]!.span.spanId).toBe("a");
    expect(children[1]!.span.spanId).toBe("b");
    expect(children[2]!.span.spanId).toBe("c");
  });

  it("handles nested children (grandchildren)", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "root", startTimestamp: "2024-01-01T00:00:00Z" }),
      makeSpan({ spanId: "child", parentSpanId: "root", startTimestamp: "2024-01-01T00:00:01Z" }),
      makeSpan({ spanId: "grandchild", parentSpanId: "child", startTimestamp: "2024-01-01T00:00:02Z" }),
    ];

    const result = buildSpanTree(spans);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.children).toHaveLength(1);
    expect(result.roots[0]!.children[0]!.children).toHaveLength(1);
    expect(result.roots[0]!.children[0]!.children[0]!.span.spanId).toBe("grandchild");
    expect(result.totalCount).toBe(3);
  });

  it("preserves totalCount equal to input length", () => {
    const spans: Span[] = [
      makeSpan({ spanId: "1", startTimestamp: "2024-01-01T00:00:00Z" }),
      makeSpan({ spanId: "2", parentSpanId: "1", startTimestamp: "2024-01-01T00:00:01Z" }),
      makeSpan({ spanId: "3", parentSpanId: "1", startTimestamp: "2024-01-01T00:00:02Z" }),
      makeSpan({ spanId: "4", parentSpanId: "2", startTimestamp: "2024-01-01T00:00:03Z" }),
      makeSpan({ spanId: "5", parentSpanId: "nonexistent", startTimestamp: "2024-01-01T00:00:04Z" }),
    ];

    const result = buildSpanTree(spans);
    expect(result.totalCount).toBe(5);
  });
});
