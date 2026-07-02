// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import {
  computeBackoffDelay,
  isThrottlingError,
  DEFAULT_BACKOFF_CONFIG,
} from "../backoff";

describe("BackoffStrategy", () => {
  describe("DEFAULT_BACKOFF_CONFIG", () => {
    it("has correct default values", () => {
      expect(DEFAULT_BACKOFF_CONFIG).toEqual({
        initialDelayMs: 1000,
        maxDelayMs: 32000,
        maxRetries: 5,
        jitterMaxMs: 500,
      });
    });
  });

  describe("computeBackoffDelay", () => {
    it("returns delay within expected range for attempt 0", () => {
      const delay = computeBackoffDelay(0);
      // 2^0 * 1000 = 1000, + jitter [0, 500]
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1500);
    });

    it("returns delay within expected range for attempt 1", () => {
      const delay = computeBackoffDelay(1);
      // 2^1 * 1000 = 2000, + jitter [0, 500]
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(2500);
    });

    it("returns delay within expected range for attempt 2", () => {
      const delay = computeBackoffDelay(2);
      // 2^2 * 1000 = 4000, + jitter [0, 500]
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(4500);
    });

    it("returns delay within expected range for attempt 3", () => {
      const delay = computeBackoffDelay(3);
      // 2^3 * 1000 = 8000, + jitter [0, 500]
      expect(delay).toBeGreaterThanOrEqual(8000);
      expect(delay).toBeLessThanOrEqual(8500);
    });

    it("returns delay within expected range for attempt 4", () => {
      const delay = computeBackoffDelay(4);
      // 2^4 * 1000 = 16000, + jitter [0, 500]
      expect(delay).toBeGreaterThanOrEqual(16000);
      expect(delay).toBeLessThanOrEqual(16500);
    });

    it("caps delay at maxDelayMs for high attempt numbers", () => {
      const delay = computeBackoffDelay(10);
      // 2^10 * 1000 = 1024000, capped at 32000, + jitter [0, 500]
      expect(delay).toBeGreaterThanOrEqual(32000);
      expect(delay).toBeLessThanOrEqual(32500);
    });

    it("uses custom config when provided", () => {
      const config = {
        initialDelayMs: 500,
        maxDelayMs: 10000,
        maxRetries: 3,
        jitterMaxMs: 100,
      };
      const delay = computeBackoffDelay(2, config);
      // 2^2 * 500 = 2000, + jitter [0, 100]
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(2100);
    });
  });

  describe("isThrottlingError", () => {
    it("returns true for TooManyRequestsException", () => {
      const error = { name: "TooManyRequestsException", message: "Rate exceeded" };
      expect(isThrottlingError(error)).toBe(true);
    });

    it("returns true for ThrottlingException", () => {
      const error = { name: "ThrottlingException", message: "Throttled" };
      expect(isThrottlingError(error)).toBe(true);
    });

    it("returns false for InvalidParameterException", () => {
      const error = { name: "InvalidParameterException", message: "Bad param" };
      expect(isThrottlingError(error)).toBe(false);
    });

    it("returns false for ResourceNotFoundException", () => {
      const error = { name: "ResourceNotFoundException", message: "Not found" };
      expect(isThrottlingError(error)).toBe(false);
    });

    it("returns false for LimitExceededException", () => {
      const error = { name: "LimitExceededException", message: "Limit hit" };
      expect(isThrottlingError(error)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isThrottlingError(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isThrottlingError(undefined)).toBe(false);
    });

    it("returns false for a string", () => {
      expect(isThrottlingError("TooManyRequestsException")).toBe(false);
    });

    it("returns false for an object without name property", () => {
      expect(isThrottlingError({ message: "error" })).toBe(false);
    });
  });
});
