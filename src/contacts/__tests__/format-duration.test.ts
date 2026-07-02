// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDuration } from "../format-duration";

describe("formatDuration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("returns dash for invalid inputs", () => {
    it("returns '-' when initiation is null", () => {
      expect(formatDuration(null, new Date("2024-03-15T10:05:00Z"))).toBe("-");
    });

    it("returns '-' when both are null", () => {
      expect(formatDuration(null, null)).toBe("-");
    });

    it("returns '-' when disconnect equals initiation", () => {
      const ts = new Date("2024-03-15T10:00:00Z");
      expect(formatDuration(ts, ts)).toBe("-");
    });

    it("returns '-' when disconnect is before initiation", () => {
      const initiation = new Date("2024-03-15T10:05:00Z");
      const disconnect = new Date("2024-03-15T10:00:00Z");
      expect(formatDuration(initiation, disconnect)).toBe("-");
    });

    it("returns '-' when disconnect is null and contact is older than 5 minutes", () => {
      vi.useFakeTimers();
      const initiation = new Date("2024-03-15T10:00:00Z");
      vi.setSystemTime(new Date("2024-03-15T10:06:00Z")); // 6 minutes later
      expect(formatDuration(initiation, null)).toBe("-");
    });
  });

  describe("returns Pending for recent contacts with no disconnect", () => {
    it("returns 'Pending' when disconnect is null and contact is recent", () => {
      vi.useFakeTimers();
      const initiation = new Date("2024-03-15T10:00:00Z");
      vi.setSystemTime(new Date("2024-03-15T10:01:00Z")); // 1 minute later
      expect(formatDuration(initiation, null)).toBe("Pending");
    });

    it("returns 'Pending' when disconnect is null and contact is exactly at 5 minute boundary", () => {
      vi.useFakeTimers();
      const initiation = new Date("2024-03-15T10:00:00Z");
      vi.setSystemTime(new Date("2024-03-15T10:04:59Z")); // just under 5 minutes
      expect(formatDuration(initiation, null)).toBe("Pending");
    });
  });

  describe("formats valid durations", () => {
    it("returns '0s' for zero-second difference (diffMs > 0 but < 1000)", () => {
      const initiation = new Date("2024-03-15T10:00:00.000Z");
      const disconnect = new Date("2024-03-15T10:00:00.500Z");
      expect(formatDuration(initiation, disconnect)).toBe("0s");
    });

    it("returns seconds only when under one minute", () => {
      const initiation = new Date("2024-03-15T10:00:00Z");
      const disconnect = new Date("2024-03-15T10:00:42Z");
      expect(formatDuration(initiation, disconnect)).toBe("42s");
    });

    it("returns minutes and seconds for durations over one minute", () => {
      const initiation = new Date("2024-03-15T10:00:00Z");
      const disconnect = new Date("2024-03-15T10:03:42Z");
      expect(formatDuration(initiation, disconnect)).toBe("3m 42s");
    });

    it("returns minutes with 0 seconds", () => {
      const initiation = new Date("2024-03-15T10:00:00Z");
      const disconnect = new Date("2024-03-15T10:02:00Z");
      expect(formatDuration(initiation, disconnect)).toBe("2m 0s");
    });

    it("handles multi-hour durations", () => {
      const initiation = new Date("2024-03-15T10:00:00Z");
      const disconnect = new Date("2024-03-15T12:30:15Z");
      // 2h 30m 15s = 150m 15s
      expect(formatDuration(initiation, disconnect)).toBe("150m 15s");
    });

    it("returns '1s' for exactly one second", () => {
      const initiation = new Date("2024-03-15T10:00:00Z");
      const disconnect = new Date("2024-03-15T10:00:01Z");
      expect(formatDuration(initiation, disconnect)).toBe("1s");
    });

    it("returns '1m 0s' for exactly one minute", () => {
      const initiation = new Date("2024-03-15T10:00:00Z");
      const disconnect = new Date("2024-03-15T10:01:00Z");
      expect(formatDuration(initiation, disconnect)).toBe("1m 0s");
    });
  });
});
