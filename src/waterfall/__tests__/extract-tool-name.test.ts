// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { extractToolName } from "../extract-tool-name";
import type { Message } from "../../sessions/types";

describe("extractToolName", () => {
  it("returns the name from the first toolUse entry found", () => {
    const messages: Message[] = [
      {
        messageId: "msg-1",
        participant: "BOT",
        timestamp: "2024-01-01T00:00:00Z",
        values: [
          {
            toolUse: {
              toolUseId: "tu-1",
              name: "SearchDocuments",
              arguments: "{}",
            },
          },
        ],
      },
    ];

    expect(extractToolName(messages)).toBe("SearchDocuments");
  });

  it("returns the first toolUse name when multiple messages have toolUse entries", () => {
    const messages: Message[] = [
      {
        messageId: "msg-1",
        participant: "BOT",
        timestamp: "2024-01-01T00:00:00Z",
        values: [
          { text: { value: "some text" } },
          {
            toolUse: {
              toolUseId: "tu-1",
              name: "FirstTool",
              arguments: "{}",
            },
          },
        ],
      },
      {
        messageId: "msg-2",
        participant: "BOT",
        timestamp: "2024-01-01T00:00:01Z",
        values: [
          {
            toolUse: {
              toolUseId: "tu-2",
              name: "SecondTool",
              arguments: "{}",
            },
          },
        ],
      },
    ];

    expect(extractToolName(messages)).toBe("FirstTool");
  });

  it('returns "unknown tool" when inputMessages is undefined', () => {
    expect(extractToolName(undefined)).toBe("unknown tool");
  });

  it('returns "unknown tool" when inputMessages is null', () => {
    expect(extractToolName(null)).toBe("unknown tool");
  });

  it('returns "unknown tool" when inputMessages is an empty array', () => {
    expect(extractToolName([])).toBe("unknown tool");
  });

  it('returns "unknown tool" when no toolUse entries exist', () => {
    const messages: Message[] = [
      {
        messageId: "msg-1",
        participant: "BOT",
        timestamp: "2024-01-01T00:00:00Z",
        values: [{ text: { value: "hello" } }],
      },
    ];

    expect(extractToolName(messages)).toBe("unknown tool");
  });

  it('returns "unknown tool" when toolUse name is empty', () => {
    const messages: Message[] = [
      {
        messageId: "msg-1",
        participant: "BOT",
        timestamp: "2024-01-01T00:00:00Z",
        values: [
          {
            toolUse: {
              toolUseId: "tu-1",
              name: "",
              arguments: "{}",
            },
          },
        ],
      },
    ];

    expect(extractToolName(messages)).toBe("unknown tool");
  });

  it("skips text and toolResult values to find toolUse", () => {
    const messages: Message[] = [
      {
        messageId: "msg-1",
        participant: "CUSTOMER",
        timestamp: "2024-01-01T00:00:00Z",
        values: [
          { text: { value: "some text" } },
          {
            toolResult: {
              toolUseId: "tu-0",
              values: [{ text: { value: "result" } }],
            },
          },
        ],
      },
      {
        messageId: "msg-2",
        participant: "BOT",
        timestamp: "2024-01-01T00:00:01Z",
        values: [
          {
            toolUse: {
              toolUseId: "tu-1",
              name: "MyTool",
              arguments: '{"key": "value"}',
            },
          },
        ],
      },
    ];

    expect(extractToolName(messages)).toBe("MyTool");
  });
});
