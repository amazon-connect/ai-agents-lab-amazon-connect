// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CodeView } from "@cloudscape-design/code-view";
import { formatJson } from "./format-json";

export interface CodeDisplayProps {
  /** The content string to display */
  content: string | null | undefined;
  /** Language for syntax highlighting (default: "json") */
  language?: string;
}

const LINE_THRESHOLD = 50;
const MAX_HEIGHT = 400;

/**
 * Wraps Cloudscape CodeView with JSON formatting, scroll container,
 * and fallback handling for empty/null/undefined content.
 */
export function CodeDisplay({ content }: CodeDisplayProps) {
  const { formatted } = formatJson(content);

  if (formatted === "-") {
    return <span>-</span>;
  }

  const lineCount = formatted.split("\n").length;
  const needsScroll = lineCount > LINE_THRESHOLD;

  const codeView = <CodeView content={formatted} lineNumbers />;

  if (needsScroll) {
    return (
      <div style={{ maxHeight: `${MAX_HEIGHT}px`, overflow: "auto" }}>
        {codeView}
      </div>
    );
  }

  return codeView;
}
