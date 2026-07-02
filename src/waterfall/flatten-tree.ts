// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Span, SpanNode, SpanTree } from "../sessions/types";

export interface FlatRow {
  span: Span;
  depth: number; // nesting level (0 = root)
  isFirstInGroup: boolean; // true for first root in a new subtree group
}

/**
 * Flattens a SpanTree into a depth-first ordered list of rows.
 *
 * Roots are sorted by startTimestamp ascending. Children within each parent
 * are also sorted by startTimestamp ascending. Each root starts a new group,
 * so the first root in each subtree has isFirstInGroup = true.
 */
export function flattenTree(tree: SpanTree): FlatRow[] {
  if (tree.roots.length === 0) {
    return [];
  }

  const sortedRoots = [...tree.roots].sort(
    (a, b) =>
      new Date(a.span.startTimestamp).getTime() -
      new Date(b.span.startTimestamp).getTime()
  );

  const rows: FlatRow[] = [];

  for (let i = 0; i < sortedRoots.length; i++) {
    const root = sortedRoots[i];
    if (root) {
      flattenNode(root, 0, true, rows);
    }
  }

  return rows;
}

function flattenNode(
  node: SpanNode,
  depth: number,
  isFirstInGroup: boolean,
  rows: FlatRow[]
): void {
  rows.push({
    span: node.span,
    depth,
    isFirstInGroup,
  });

  const sortedChildren = [...node.children].sort(
    (a, b) =>
      new Date(a.span.startTimestamp).getTime() -
      new Date(b.span.startTimestamp).getTime()
  );

  for (const child of sortedChildren) {
    flattenNode(child, depth + 1, false, rows);
  }
}
