// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { validateBatchConfig } from "../batch-validation";

describe("validateBatchConfig", () => {
  describe("valid inputs", () => {
    it("returns valid for iteration count 1 and concurrency 1", () => {
      const result = validateBatchConfig("1", "1");
      expect(result).toEqual({ valid: true });
    });

    it("returns valid for iteration count 1000 and concurrency 50", () => {
      const result = validateBatchConfig("1000", "50");
      expect(result).toEqual({ valid: true });
    });

    it("returns valid for typical values", () => {
      const result = validateBatchConfig("100", "10");
      expect(result).toEqual({ valid: true });
    });

    it("trims whitespace from inputs", () => {
      const result = validateBatchConfig("  50  ", "  10  ");
      expect(result).toEqual({ valid: true });
    });
  });

  describe("iteration count validation", () => {
    it("returns error for empty iteration count", () => {
      const result = validateBatchConfig("", "10");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe("Iteration count is required.");
      expect(result.concurrencyError).toBeUndefined();
    });

    it("returns error for whitespace-only iteration count", () => {
      const result = validateBatchConfig("   ", "10");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe("Iteration count is required.");
    });

    it("returns error for non-integer iteration count", () => {
      const result = validateBatchConfig("3.5", "10");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe(
        "Iteration count must be a whole number."
      );
    });

    it("returns error for non-numeric iteration count", () => {
      const result = validateBatchConfig("abc", "10");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe(
        "Iteration count must be a whole number."
      );
    });

    it("returns error for iteration count below range", () => {
      const result = validateBatchConfig("0", "10");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe(
        "Iteration count must be between 1 and 1000."
      );
    });

    it("returns error for iteration count above range", () => {
      const result = validateBatchConfig("1001", "10");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe(
        "Iteration count must be between 1 and 1000."
      );
    });
  });

  describe("concurrency validation", () => {
    it("returns error for empty concurrency", () => {
      const result = validateBatchConfig("100", "");
      expect(result.valid).toBe(false);
      expect(result.concurrencyError).toBe("Concurrency is required.");
      expect(result.iterationCountError).toBeUndefined();
    });

    it("returns error for non-integer concurrency", () => {
      const result = validateBatchConfig("100", "2.5");
      expect(result.valid).toBe(false);
      expect(result.concurrencyError).toBe(
        "Concurrency must be a whole number."
      );
    });

    it("returns error for concurrency below range", () => {
      const result = validateBatchConfig("100", "0");
      expect(result.valid).toBe(false);
      expect(result.concurrencyError).toBe(
        "Concurrency must be between 1 and 50."
      );
    });

    it("returns error for concurrency above range", () => {
      const result = validateBatchConfig("100", "51");
      expect(result.valid).toBe(false);
      expect(result.concurrencyError).toBe(
        "Concurrency must be between 1 and 50."
      );
    });
  });

  describe("both fields invalid", () => {
    it("returns errors for both fields when both are invalid", () => {
      const result = validateBatchConfig("", "");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe("Iteration count is required.");
      expect(result.concurrencyError).toBe("Concurrency is required.");
    });

    it("returns errors for both fields with different error types", () => {
      const result = validateBatchConfig("abc", "999");
      expect(result.valid).toBe(false);
      expect(result.iterationCountError).toBe(
        "Iteration count must be a whole number."
      );
      expect(result.concurrencyError).toBe(
        "Concurrency must be between 1 and 50."
      );
    });
  });
});
