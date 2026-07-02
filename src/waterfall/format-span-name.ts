// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Converts a raw span name (e.g. "invoke_agent", "execute_tool", "inference")
 * into a human-readable display label (e.g. "Invoke Agent", "Execute Tool", "Inference").
 */
export function formatSpanName(spanName: string): string {
  return spanName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
