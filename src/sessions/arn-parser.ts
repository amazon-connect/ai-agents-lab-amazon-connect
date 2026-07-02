// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ArnParseResult } from "./types";

const VALID_PARTITIONS = new Set(["aws", "aws-cn", "aws-us-gov"]);

/**
 * Parses a Wisdom session ARN and extracts its components.
 *
 * Expected format: arn:{partition}:wisdom:{region}:{account}:session/{assistantId}/{sessionId}
 */
export function parseSessionArn(
  arn: string | null | undefined
): ArnParseResult {
  if (arn == null || arn === "") {
    return { ok: false, error: { type: "missing_input" } };
  }

  const parts = arn.split(":");
  if (parts.length !== 6) {
    return {
      ok: false,
      error: {
        type: "invalid_format",
        detail: `Expected 6 colon-separated segments, got ${parts.length}`,
      },
    };
  }

  const prefix = parts[0] as string;
  const partition = parts[1] as string;
  const service = parts[2] as string;
  const region = parts[3] as string;
  const account = parts[4] as string;
  const resource = parts[5] as string;

  if (prefix !== "arn") {
    return {
      ok: false,
      error: { type: "invalid_format", detail: `ARN must start with "arn", got "${prefix}"` },
    };
  }

  if (!VALID_PARTITIONS.has(partition)) {
    return {
      ok: false,
      error: {
        type: "invalid_format",
        detail: `Invalid partition "${partition}", expected one of: aws, aws-cn, aws-us-gov`,
      },
    };
  }

  if (service !== "wisdom") {
    return {
      ok: false,
      error: { type: "invalid_format", detail: `Expected service "wisdom", got "${service}"` },
    };
  }

  if (!region) {
    return {
      ok: false,
      error: { type: "invalid_format", detail: "Region segment is empty" },
    };
  }

  if (!account) {
    return {
      ok: false,
      error: { type: "invalid_format", detail: "Account segment is empty" },
    };
  }

  const resourceParts = resource.split("/");
  if (resourceParts.length !== 3) {
    return {
      ok: false,
      error: {
        type: "invalid_format",
        detail: `Expected resource format "session/{assistantId}/{sessionId}", got ${resourceParts.length} path segments`,
      },
    };
  }

  const [resourceType, assistantId, sessionId] = resourceParts;

  if (resourceType !== "session") {
    return {
      ok: false,
      error: {
        type: "invalid_format",
        detail: `Expected resource type "session", got "${resourceType}"`,
      },
    };
  }

  if (!assistantId) {
    return {
      ok: false,
      error: { type: "invalid_format", detail: "Assistant ID is empty" },
    };
  }

  if (!sessionId) {
    return {
      ok: false,
      error: { type: "invalid_format", detail: "Session ID is empty" },
    };
  }

  return {
    ok: true,
    value: { partition, region, account, assistantId, sessionId },
  };
}
