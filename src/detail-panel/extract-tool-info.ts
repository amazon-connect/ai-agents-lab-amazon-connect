// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Message } from "../sessions/types";

export interface ToolInfo {
  toolName: string;
  toolUseId: string;
  arguments: string | undefined;
}

const DEFAULT_TOOL_INFO: ToolInfo = {
  toolName: "Unknown tool",
  toolUseId: "-",
  arguments: undefined,
};

/**
 * Extracts tool information from an execute_tool span's inputMessages.
 * Returns the first toolUse entry found, or defaults ("Unknown tool", "-", undefined).
 */
export function extractToolInfo(messages: Message[] | undefined): ToolInfo {
  if (!messages || messages.length === 0) {
    return DEFAULT_TOOL_INFO;
  }

  for (const message of messages) {
    for (const value of message.values) {
      if ("toolUse" in value) {
        return {
          toolName: value.toolUse.name,
          toolUseId: value.toolUse.toolUseId,
          arguments: value.toolUse.arguments,
        };
      }
    }
  }

  return DEFAULT_TOOL_INFO;
}
