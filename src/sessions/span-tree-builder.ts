// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Span, SpanNode, SpanTree } from "./types";

/**
 * Builds a hierarchical span tree from a flat list of spans.
 *
 * Groups spans by parentSpanId. Spans with no parentSpanId or an orphaned
 * parentSpanId (referencing a span not in the list) become root nodes.
 * Roots and children are sorted by startTimestamp ascending.
 */
export function buildSpanTree(spans: Span[]): SpanTree {
  if (spans.length === 0) {
    return { roots: [], totalCount: 0 };
  }

  // Index all span IDs for quick lookup
  const spanIds = new Set(spans.map((s) => s.spanId));

  // Group spans by their parentSpanId
  const childrenMap = new Map<string, SpanNode[]>();
  const roots: SpanNode[] = [];

  // Create nodes for all spans
  const nodeMap = new Map<string, SpanNode>();
  for (const span of spans) {
    nodeMap.set(span.spanId, { span, children: [] });
  }

  // Assign each node to its parent or to roots
  for (const span of spans) {
    const node = nodeMap.get(span.spanId)!;
    const parentId = span.parentSpanId;

    if (!parentId || !spanIds.has(parentId)) {
      // No parent or orphaned parent → root
      roots.push(node);
    } else {
      // Valid parent exists in the list
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(node);
    }
  }

  // Attach children to their parent nodes
  for (const [parentId, children] of childrenMap) {
    const parentNode = nodeMap.get(parentId);
    if (parentNode) {
      parentNode.children = children;
    }
  }

  // Sort by startTimestamp ascending
  const sortByTimestamp = (a: SpanNode, b: SpanNode) =>
    a.span.startTimestamp.localeCompare(b.span.startTimestamp);

  roots.sort(sortByTimestamp);

  // Sort children recursively
  const sortChildren = (node: SpanNode): void => {
    if (node.children.length > 0) {
      node.children.sort(sortByTimestamp);
      node.children.forEach(sortChildren);
    }
  };
  roots.forEach(sortChildren);

  return { roots, totalCount: spans.length };
}
