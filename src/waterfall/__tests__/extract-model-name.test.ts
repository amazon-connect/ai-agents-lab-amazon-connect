// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { extractModelName } from "../extract-model-name";

describe("extractModelName", () => {
  it("extracts substring after last / for ARN-style input", () => {
    expect(
      extractModelName(
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
      ),
    ).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0");
  });

  it("extracts substring after last / when multiple slashes present", () => {
    expect(extractModelName("a/b/c/model-name")).toBe("model-name");
  });

  it("returns full string when no / present", () => {
    expect(extractModelName("claude-3-sonnet")).toBe("claude-3-sonnet");
  });

  it('returns "unknown model" for undefined', () => {
    expect(extractModelName(undefined)).toBe("unknown model");
  });

  it('returns "unknown model" for null', () => {
    expect(extractModelName(null)).toBe("unknown model");
  });

  it('returns "unknown model" for empty string', () => {
    expect(extractModelName("")).toBe("unknown model");
  });

  it('returns "unknown model" for whitespace-only string', () => {
    expect(extractModelName("   ")).toBe("unknown model");
    expect(extractModelName("\t\n")).toBe("unknown model");
  });

  it("handles trailing slash (returns empty after last /)", () => {
    // A trailing slash means the substring after last / is empty string.
    // Per requirement 9.1, we extract what's after the last slash.
    // An empty result after slash is a valid extraction.
    expect(extractModelName("prefix/")).toBe("");
  });

  it("does not truncate model names exceeding 64 characters", () => {
    const longName = "a".repeat(100);
    expect(extractModelName(`prefix/${longName}`)).toBe(longName);
    expect(extractModelName(`prefix/${longName}`).length).toBe(100);
  });

  it("round-trip: prefix + extracted name = original (Req 9.4)", () => {
    const original =
      "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0";
    const lastSlash = original.lastIndexOf("/");
    const prefix = original.substring(0, lastSlash + 1);
    const extracted = extractModelName(original);
    expect(prefix + extracted).toBe(original);
  });
});
