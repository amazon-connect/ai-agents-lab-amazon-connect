// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { formatDuration } from "../format-duration";

describe("formatDuration", () => {
  describe("null/undefined inputs", () => {
    it("returns '-' for null", () => {
      expect(formatDuration(null)).toBe("-");
    });

    it("returns '-' for undefined", () => {
      expect(formatDuration(undefined)).toBe("-");
    });
  });

  describe("negative or zero values", () => {
    it("returns '0ms' for 0", () => {
      expect(formatDuration(0)).toBe("0ms");
    });

    it("returns '0ms' for negative values", () => {
      expect(formatDuration(-100)).toBe("0ms");
      expect(formatDuration(-1)).toBe("0ms");
    });
  });

  describe("milliseconds format (< 1000ms)", () => {
    it("returns '1ms' for 1", () => {
      expect(formatDuration(1)).toBe("1ms");
    });

    it("returns '142ms' for 142", () => {
      expect(formatDuration(142)).toBe("142ms");
    });

    it("returns '999ms' for 999", () => {
      expect(formatDuration(999)).toBe("999ms");
    });

    it("truncates fractional milliseconds", () => {
      expect(formatDuration(142.7)).toBe("142ms");
    });
  });

  describe("seconds format (1000–59999ms)", () => {
    it("returns '1.0s' for 1000", () => {
      expect(formatDuration(1000)).toBe("1.0s");
    });

    it("returns '2.3s' for 2349 (truncated, not rounded)", () => {
      expect(formatDuration(2349)).toBe("2.3s");
    });

    it("returns '59.9s' for 59999", () => {
      expect(formatDuration(59999)).toBe("59.9s");
    });

    it("returns '1.5s' for 1500", () => {
      expect(formatDuration(1500)).toBe("1.5s");
    });

    it("truncates rather than rounds (2.99s stays 2.9s)", () => {
      expect(formatDuration(2999)).toBe("2.9s");
    });
  });

  describe("minutes format (≥ 60000ms)", () => {
    it("returns '1m 0s' for 60000", () => {
      expect(formatDuration(60000)).toBe("1m 0s");
    });

    it("returns '2m 15s' for 135000", () => {
      expect(formatDuration(135000)).toBe("2m 15s");
    });

    it("returns '1440m 0s' for 86400000 (24 hours)", () => {
      expect(formatDuration(86400000)).toBe("1440m 0s");
    });

    it("truncates seconds (not rounds)", () => {
      expect(formatDuration(61999)).toBe("1m 1s");
    });
  });
});
