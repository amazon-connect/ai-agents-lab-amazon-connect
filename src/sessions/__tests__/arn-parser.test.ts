// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { parseSessionArn } from "../arn-parser";

describe("parseSessionArn", () => {
  describe("missing input", () => {
    it("returns missing_input for null", () => {
      const result = parseSessionArn(null);
      expect(result).toEqual({ ok: false, error: { type: "missing_input" } });
    });

    it("returns missing_input for undefined", () => {
      const result = parseSessionArn(undefined);
      expect(result).toEqual({ ok: false, error: { type: "missing_input" } });
    });

    it("returns missing_input for empty string", () => {
      const result = parseSessionArn("");
      expect(result).toEqual({ ok: false, error: { type: "missing_input" } });
    });
  });

  describe("valid ARNs", () => {
    it("parses a standard aws partition ARN", () => {
      const arn =
        "arn:aws:wisdom:us-east-1:123456789012:session/assistant-abc/session-xyz";
      const result = parseSessionArn(arn);
      expect(result).toEqual({
        ok: true,
        value: {
          partition: "aws",
          region: "us-east-1",
          account: "123456789012",
          assistantId: "assistant-abc",
          sessionId: "session-xyz",
        },
      });
    });

    it("parses an aws-cn partition ARN", () => {
      const arn =
        "arn:aws-cn:wisdom:cn-north-1:111222333444:session/asst-1/sess-2";
      const result = parseSessionArn(arn);
      expect(result).toEqual({
        ok: true,
        value: {
          partition: "aws-cn",
          region: "cn-north-1",
          account: "111222333444",
          assistantId: "asst-1",
          sessionId: "sess-2",
        },
      });
    });

    it("parses an aws-us-gov partition ARN", () => {
      const arn =
        "arn:aws-us-gov:wisdom:us-gov-west-1:999888777666:session/a1b2c3/d4e5f6";
      const result = parseSessionArn(arn);
      expect(result).toEqual({
        ok: true,
        value: {
          partition: "aws-us-gov",
          region: "us-gov-west-1",
          account: "999888777666",
          assistantId: "a1b2c3",
          sessionId: "d4e5f6",
        },
      });
    });
  });

  describe("invalid format", () => {
    it("rejects ARN with wrong prefix", () => {
      const result = parseSessionArn(
        "foo:aws:wisdom:us-east-1:123456789012:session/a/b"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with invalid partition", () => {
      const result = parseSessionArn(
        "arn:aws-invalid:wisdom:us-east-1:123456789012:session/a/b"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with wrong service", () => {
      const result = parseSessionArn(
        "arn:aws:s3:us-east-1:123456789012:session/a/b"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with wrong resource type", () => {
      const result = parseSessionArn(
        "arn:aws:wisdom:us-east-1:123456789012:bucket/a/b"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with too few path segments", () => {
      const result = parseSessionArn(
        "arn:aws:wisdom:us-east-1:123456789012:session/only-one"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with too many path segments", () => {
      const result = parseSessionArn(
        "arn:aws:wisdom:us-east-1:123456789012:session/a/b/c"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with too few colon-separated segments", () => {
      const result = parseSessionArn("arn:aws:wisdom:us-east-1:123456789012");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with empty region", () => {
      const result = parseSessionArn(
        "arn:aws:wisdom::123456789012:session/a/b"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });

    it("rejects ARN with empty account", () => {
      const result = parseSessionArn(
        "arn:aws:wisdom:us-east-1::session/a/b"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("invalid_format");
      }
    });
  });

  describe("round-trip property", () => {
    it("reconstructed ARN matches original", () => {
      const arn =
        "arn:aws:wisdom:eu-west-1:555666777888:session/my-assistant/my-session";
      const result = parseSessionArn(arn);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const { partition, region, account, assistantId, sessionId } =
          result.value;
        const reconstructed = `arn:${partition}:wisdom:${region}:${account}:session/${assistantId}/${sessionId}`;
        expect(reconstructed).toBe(arn);
      }
    });
  });
});
