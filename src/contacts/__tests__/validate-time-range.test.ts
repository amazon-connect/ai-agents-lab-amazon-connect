// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { validateTimeRange } from "../validate-time-range";

describe("validateTimeRange", () => {
  it("returns valid: true for a valid time range", () => {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000); // 1 hour ago
    const result = validateTimeRange(start, end);
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid when start equals end", () => {
    const now = new Date(Date.now() - 1000);
    const result = validateTimeRange(now, now);
    expect(result).toEqual({
      valid: false,
      message: "Start time must be before end time.",
    });
  });

  it("returns invalid when start is after end", () => {
    const end = new Date(Date.now() - 60 * 60 * 1000);
    const start = new Date(end.getTime() + 1000);
    const result = validateTimeRange(start, end);
    expect(result).toEqual({
      valid: false,
      message: "Start time must be before end time.",
    });
  });

  it("returns invalid when span exceeds 30 days", () => {
    const end = new Date(Date.now() - 1000);
    const start = new Date(end.getTime() - 31 * 24 * 60 * 60 * 1000);
    const result = validateTimeRange(start, end);
    expect(result).toEqual({
      valid: false,
      message: "Time range cannot exceed 30 days.",
    });
  });

  it("returns valid when span is exactly 30 days", () => {
    const end = new Date(Date.now() - 1000);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = validateTimeRange(start, end);
    expect(result).toEqual({ valid: true });
  });

  it("returns invalid when end is in the future", () => {
    const end = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const start = new Date(Date.now() - 60 * 60 * 1000);
    const result = validateTimeRange(start, end);
    expect(result).toEqual({
      valid: false,
      message: "End time cannot be in the future.",
    });
  });

  it("checks conditions in order: start >= end takes priority", () => {
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000); // future
    const end = new Date(Date.now() + 1 * 60 * 60 * 1000); // also future but before start
    const result = validateTimeRange(start, end);
    expect(result).toEqual({
      valid: false,
      message: "Start time must be before end time.",
    });
  });
});
