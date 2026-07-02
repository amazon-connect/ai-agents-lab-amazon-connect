// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Extracts a short model name from a full model ARN or path.
 *
 * - If the input contains a forward slash, returns the substring after the last `/`.
 * - If no forward slash is present, returns the full string.
 * - Returns "unknown model" for absent, empty, or whitespace-only input.
 */
export function extractModelName(
  requestModel: string | undefined | null,
): string {
  if (
    requestModel === undefined ||
    requestModel === null ||
    requestModel.trim() === ""
  ) {
    return "unknown model";
  }

  const lastSlashIndex = requestModel.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return requestModel;
  }

  return requestModel.substring(lastSlashIndex + 1);
}
