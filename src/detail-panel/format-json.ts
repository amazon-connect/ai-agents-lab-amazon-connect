// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Result of a JSON formatting attempt.
 */
export interface FormatJsonResult {
  formatted: string;
  isJson: boolean;
}

/**
 * Best-effort formatting for truncated JSON content.
 * Inserts newlines and indentation at JSON structural boundaries
 * to make long single-line content readable, even when it can't be parsed.
 */
function bestEffortFormat(content: string, status: string): string {
  // Insert line breaks after { [ , and before } ]
  let indent = 0;
  let inString = false;
  let escaped = false;

  const lines: string[] = [`[status: ${status}]`, ""];

  let currentLine = "";

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escaped) {
      currentLine += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      currentLine += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      currentLine += ch;
      continue;
    }

    if (inString) {
      currentLine += ch;
      continue;
    }

    if (ch === "{" || ch === "[") {
      currentLine += ch;
      lines.push("  ".repeat(indent) + currentLine);
      currentLine = "";
      indent++;
    } else if (ch === "}" || ch === "]") {
      if (currentLine.trim()) {
        lines.push("  ".repeat(indent) + currentLine);
        currentLine = "";
      }
      indent = Math.max(0, indent - 1);
      currentLine = ch;
    } else if (ch === ",") {
      currentLine += ch;
      lines.push("  ".repeat(indent) + currentLine);
      currentLine = "";
    } else {
      currentLine += ch;
    }
  }

  // Flush remaining content
  if (currentLine.trim()) {
    lines.push("  ".repeat(indent) + currentLine);
  }

  // Add truncation indicator
  lines.push("");
  lines.push("... [truncated by API at 25,000 characters]");

  return lines.join("\n");
}

/**
 * Recursively expands string values that contain valid JSON.
 * This handles the common pattern where API responses contain
 * stringified JSON nested inside JSON objects.
 */
function expandNestedJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      // Only expand if it parsed to an object or array (not primitives)
      if (typeof parsed === "object" && parsed !== null) {
        return expandNestedJson(parsed);
      }
    } catch {
      // Not JSON, return as-is
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(expandNestedJson);
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = expandNestedJson(val);
    }
    return result;
  }

  return value;
}

/**
 * Attempts to parse and pretty-print a JSON string.
 *
 * - Valid JSON → returns 2-space indented representation with isJson: true
 *   (also expands nested stringified JSON values)
 * - Non-JSON string that looks pre-formatted → normalizes indentation
 * - Null/undefined/empty/whitespace-only → returns "-" with isJson: false
 */
export function formatJson(input: string | null | undefined): FormatJsonResult {
  if (input === null || input === undefined || input.trim() === "") {
    return { formatted: "-", isJson: false };
  }

  // First try: parse as valid JSON
  try {
    const parsed = JSON.parse(input);
    const expanded = expandNestedJson(parsed);
    return { formatted: JSON.stringify(expanded, null, 2), isJson: true };
  } catch {
    // Not valid JSON
  }

  // Second try: detect the common pattern where a wrapper object contains
  // an "output" field with unescaped nested JSON (malformed from the API).
  // Pattern: { "status": "...", "output": "{ ... }" }
  // The API may also truncate at 25,000 chars, so the closing may be missing.
  const trimmed = input.trim();
  const outputMatch = trimmed.match(/^\{\s*"status"\s*:\s*"([^"]*)"\s*,\s*"output"\s*:\s*"/);
  if (outputMatch) {
    const status = outputMatch[1] ?? "unknown";
    const innerStart = outputMatch[0].length;
    // Extract everything after "output": " as the inner content.
    // If the wrapper is intact, strip the trailing " } — otherwise take it all (truncated).
    const trailingMatch = trimmed.match(/"\s*\}\s*$/);
    const innerEnd = trailingMatch
      ? trimmed.length - trailingMatch[0].length
      : trimmed.length;
    if (innerEnd > innerStart) {
      const innerContent = trimmed.slice(innerStart, innerEnd);
      // Try to parse the inner content as JSON
      try {
        const innerParsed = JSON.parse(innerContent);
        const expanded = expandNestedJson(innerParsed);
        const fullObject = { status, output: expanded };
        return { formatted: JSON.stringify(fullObject, null, 2), isJson: true };
      } catch {
        // Inner content isn't valid JSON (likely truncated by API at 25k chars).
        // Best-effort: insert line breaks at structural boundaries to make it readable.
        const readable = bestEffortFormat(innerContent.trim(), status);
        return { formatted: readable, isJson: false };
      }
    }
  }

  // Third try: strip common leading whitespace (dedent) for pre-formatted content
  const lines = trimmed.split("\n");
  if (lines.length > 1) {
    // Find minimum leading whitespace across non-empty lines
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (leadingSpaces < minIndent) minIndent = leadingSpaces;
    }
    if (minIndent > 0 && minIndent < Infinity) {
      const dedented = lines.map((line) => line.slice(minIndent)).join("\n");
      return { formatted: dedented, isJson: false };
    }
  }

  return { formatted: trimmed, isJson: false };
}
