// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ImportResult } from "./types";

/**
 * Parse and validate a batch export JSON file for the evaluations page.
 *
 * Validation steps:
 * 1. Parse as JSON — reject if invalid
 * 2. Check for `iterations` field that is a non-empty array — reject if missing/invalid
 * 3. Extract completed iterations with non-empty contactId
 * 4. Return success result (even if no completed iterations with contactId — warning handled at UI level)
 */
export function parseImportFile(contents: string): ImportResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Invalid JSON: ${message}` };
  }

  // Step 2: Validate structure — iterations must be a non-empty array
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as Record<string, unknown>).iterations) ||
    ((parsed as Record<string, unknown>).iterations as unknown[]).length === 0
  ) {
    return {
      success: false,
      error: "File does not contain a valid non-empty 'iterations' array",
    };
  }

  const data = parsed as {
    iterations: unknown[];
    batchConfig?: { scriptName?: string; [key: string]: unknown };
    scriptName?: string;
    [key: string]: unknown;
  };

  // Step 3: Extract completed iterations with non-empty contactId
  const completedWithContactId: { contactId: string; iterationNumber: number }[] = [];

  for (const item of data.iterations) {
    if (item !== null && typeof item === "object") {
      const iteration = item as Record<string, unknown>;
      if (
        iteration.status === "completed" &&
        typeof iteration.contactId === "string" &&
        iteration.contactId.length > 0
      ) {
        completedWithContactId.push({
          contactId: iteration.contactId,
          iterationNumber:
            typeof iteration.iterationNumber === "number"
              ? iteration.iterationNumber
              : 0,
        });
      }
    }
  }

  // Step 4: Derive script name from payload (fallback to "Imported batch")
  const scriptName =
    (data.batchConfig?.scriptName as string) ||
    (data.scriptName as string) ||
    "Imported batch";

  return {
    success: true,
    scriptName,
    totalIterations: data.iterations.length,
    completedWithContactId,
  };
}
