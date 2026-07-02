// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Message } from "../sessions/types";

/**
 * Extracts the tool name from inputMessages by finding the first toolUse entry.
 *
 * Iterates messages in order, then each message's values in order, and returns
 * the `name` field from the first `toolUse` entry found.
 *
 * Returns "unknown tool" if no toolUse entry exists or the name is empty.
 */
export function extractToolName(
  inputMessages: Message[] | undefined | null
): string {
  if (!inputMessages) {
    return "unknown tool";
  }

  for (const message of inputMessages) {
    for (const value of message.values) {
      if ("toolUse" in value && value.toolUse.name) {
        return value.toolUse.name;
      }
    }
  }

  return "unknown tool";
}
