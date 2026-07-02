// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export function validateTimeRange(
  start: Date,
  end: Date
): { valid: true } | { valid: false; message: string } {
  if (start >= end) {
    return { valid: false, message: "Start time must be before end time." };
  }
  const diffMs = end.getTime() - start.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (diffMs > thirtyDaysMs) {
    return { valid: false, message: "Time range cannot exceed 30 days." };
  }
  if (end > new Date()) {
    return { valid: false, message: "End time cannot be in the future." };
  }
  return { valid: true };
}
