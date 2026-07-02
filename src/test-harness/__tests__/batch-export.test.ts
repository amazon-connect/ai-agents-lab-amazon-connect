// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateExportFilename,
  buildExportPayload,
  downloadJson,
  type BatchResultState,
  type ExportPayload,
} from "../batch-export";

describe("generateExportFilename", () => {
  it("produces correct filename for simple script name", () => {
    const result = generateExportFilename(
      "Login flow test",
      "2024-01-15T10:30:00.000Z"
    );
    expect(result).toBe("batch-Login-flow-test-20240115T103000Z.json");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    const result = generateExportFilename(
      "test@script#v2!",
      "2024-06-01T00:00:00.000Z"
    );
    expect(result).toBe("batch-test-script-v2-20240601T000000Z.json");
  });

  it("collapses consecutive hyphens", () => {
    const result = generateExportFilename(
      "test---name",
      "2024-01-01T12:00:00.000Z"
    );
    expect(result).toBe("batch-test-name-20240101T120000Z.json");
  });

  it("removes leading and trailing hyphens from sanitized name", () => {
    const result = generateExportFilename(
      "---test---",
      "2024-01-01T00:00:00.000Z"
    );
    expect(result).toBe("batch-test-20240101T000000Z.json");
  });

  it("truncates name to 50 characters", () => {
    const longName = "a".repeat(60);
    const result = generateExportFilename(
      longName,
      "2024-01-01T00:00:00.000Z"
    );
    const namePart = result.replace("batch-", "").replace(/-\d{8}T\d{6}Z\.json$/, "");
    expect(namePart.length).toBeLessThanOrEqual(50);
  });

  it("avoids trailing hyphen after truncation", () => {
    // 49 'a' chars + a special char at position 50 → after sanitize, 49 a's + hyphen at 50
    const name = "a".repeat(49) + "!" + "b".repeat(10);
    const result = generateExportFilename(name, "2024-01-01T00:00:00.000Z");
    const namePart = result.replace("batch-", "").replace(/-\d{8}T\d{6}Z\.json$/, "");
    expect(namePart).not.toMatch(/-$/);
  });

  it("preserves existing hyphens in script name", () => {
    const result = generateExportFilename(
      "my-test-script",
      "2024-03-15T08:45:30.000Z"
    );
    expect(result).toBe("batch-my-test-script-20240315T084530Z.json");
  });

  it("formats timestamp correctly in UTC", () => {
    const result = generateExportFilename(
      "test",
      "2024-12-31T23:59:59.999Z"
    );
    expect(result).toBe("batch-test-20241231T235959Z.json");
  });

  it("handles empty script name", () => {
    const result = generateExportFilename("", "2024-01-01T00:00:00.000Z");
    expect(result).toBe("batch--20240101T000000Z.json");
  });
});

describe("buildExportPayload", () => {
  it("extracts batchConfig from state", () => {
    const state: BatchResultState = {
      status: "completed",
      scriptName: "Test Script",
      agentArn: "arn:aws:connect:us-east-1:123456789:agent/test",
      iterationCount: 100,
      concurrencyLimit: 10,
      startTimestamp: "2024-01-15T10:30:00.000Z",
      iterations: [],
      aggregateStats: {
        counts: { completed: 0, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
        latency: null,
        totalDurationMs: 0,
      },
    };

    const payload = buildExportPayload(state);
    expect(payload.batchConfig).toEqual({
      iterationCount: 100,
      concurrencyLimit: 10,
    });
  });

  it("includes aggregateStats from state", () => {
    const stats = {
      counts: { completed: 85, exit_branch: 5, max_timeout: 3, user_stopped: 7, failed: 0 },
      latency: { average: 4200, p50: 3800, p95: 7500 },
      totalDurationMs: 45000,
    };

    const state: BatchResultState = {
      status: "completed",
      scriptName: "Test",
      agentArn: "arn:aws:test",
      iterationCount: 100,
      concurrencyLimit: 10,
      startTimestamp: "2024-01-15T10:30:00.000Z",
      iterations: [],
      aggregateStats: stats,
    };

    const payload = buildExportPayload(state);
    expect(payload.aggregateStats).toEqual(stats);
  });

  it("includes iterations array from state", () => {
    const iterations = [
      {
        iterationNumber: 1,
        status: "completed" as const,
        terminationReason: "completed" as const,
        durationMs: 4523,
        contactId: "abc-123",
        turnsCompleted: 5,
        turnsTotal: 5,
        retryCount: 0,
      },
    ];

    const state: BatchResultState = {
      status: "completed",
      scriptName: "Test",
      agentArn: "arn:aws:test",
      iterationCount: 1,
      concurrencyLimit: 1,
      startTimestamp: "2024-01-15T10:30:00.000Z",
      iterations,
      aggregateStats: {
        counts: { completed: 1, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
        latency: { average: 4523, p50: 4523, p95: 4523 },
        totalDurationMs: 4523,
      },
    };

    const payload = buildExportPayload(state);
    expect(payload.iterations).toEqual(iterations);
  });

  it("uses default stats when aggregateStats is undefined", () => {
    const state: BatchResultState = {
      status: "running",
      scriptName: "Test",
      agentArn: "arn:aws:test",
      iterationCount: 10,
      concurrencyLimit: 5,
      startTimestamp: "2024-01-15T10:30:00.000Z",
      iterations: [],
    };

    const payload = buildExportPayload(state);
    expect(payload.aggregateStats).toEqual({
      counts: { completed: 0, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
      latency: null,
      totalDurationMs: 0,
    });
  });
});

describe("downloadJson", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let removeChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;
  let createdAnchor: HTMLAnchorElement;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/fake-url");
    revokeObjectURLMock = vi.fn();
    appendChildMock = vi.fn();
    removeChildMock = vi.fn();
    clickMock = vi.fn();

    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    createdAnchor = {
      href: "",
      download: "",
      style: { display: "" },
      click: clickMock,
    } as unknown as HTMLAnchorElement;

    vi.spyOn(document, "createElement").mockReturnValue(createdAnchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(appendChildMock as unknown as (node: Node) => Node);
    vi.spyOn(document.body, "removeChild").mockImplementation(removeChildMock as unknown as (child: Node) => Node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a Blob with JSON content", () => {
    const payload: ExportPayload = {
      batchConfig: { iterationCount: 10, concurrencyLimit: 5 },
      aggregateStats: {
        counts: { completed: 10, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
        latency: { average: 1000, p50: 900, p95: 1500 },
        totalDurationMs: 5000,
      },
      iterations: [],
    };

    downloadJson(payload, "test-file.json");

    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("sets correct download filename on anchor", () => {
    const payload: ExportPayload = {
      batchConfig: { iterationCount: 1, concurrencyLimit: 1 },
      aggregateStats: {
        counts: { completed: 0, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
        latency: null,
        totalDurationMs: 0,
      },
      iterations: [],
    };

    downloadJson(payload, "batch-test-20240101T000000Z.json");

    expect(createdAnchor.download).toBe("batch-test-20240101T000000Z.json");
  });

  it("triggers click on the anchor element", () => {
    const payload: ExportPayload = {
      batchConfig: { iterationCount: 1, concurrencyLimit: 1 },
      aggregateStats: {
        counts: { completed: 0, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
        latency: null,
        totalDurationMs: 0,
      },
      iterations: [],
    };

    downloadJson(payload, "test.json");

    expect(clickMock).toHaveBeenCalledOnce();
  });

  it("appends anchor to document body", () => {
    const payload: ExportPayload = {
      batchConfig: { iterationCount: 1, concurrencyLimit: 1 },
      aggregateStats: {
        counts: { completed: 0, exit_branch: 0, max_timeout: 0, user_stopped: 0, failed: 0 },
        latency: null,
        totalDurationMs: 0,
      },
      iterations: [],
    };

    downloadJson(payload, "test.json");

    expect(appendChildMock).toHaveBeenCalledWith(createdAnchor);
  });
});
