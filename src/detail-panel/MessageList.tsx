// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import type { Message } from "../sessions/types";
import { MessageBlock } from "./MessageBlock";
import Toggle from "@cloudscape-design/components/toggle";

export interface MessageListProps {
  /** Array of messages to render */
  messages: Message[];
  /** Section heading (e.g., "Input messages", "Output messages") */
  heading: string;
  /** If true, marks the first CUSTOMER message as a cumulative transcript */
  markFirstAsCumulative?: boolean;
}

/**
 * Checks if a message has any meaningful content to display.
 * Filters out messages with empty values arrays and messages where
 * all text values are empty/whitespace-only.
 */
function hasContent(message: Message): boolean {
  if (message.values.length === 0) return false;

  return message.values.some((value) => {
    if ("text" in value) return value.text.value.trim().length > 0;
    if ("toolUse" in value) return true;
    if ("toolResult" in value) return true;
    return false;
  });
}

/**
 * Renders messages as a vertical list of MessageBlock components with 8px spacing.
 * Filters out messages with no meaningful content (empty values or whitespace-only text).
 * Displays an empty state if no messages with content remain.
 */
export function MessageList({ messages, heading, markFirstAsCumulative }: MessageListProps) {
  const messagesWithContent = messages.filter(hasContent);
  const [showCumulative, setShowCumulative] = useState(true);

  // Track whether we've seen the first CUSTOMER message (for cumulative badge)
  let firstCustomerSeen = false;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3>{heading}</h3>
        {markFirstAsCumulative && (
          <Toggle
            checked={showCumulative}
            onChange={({ detail }) => setShowCumulative(detail.checked)}
          >
            Show cumulative transcript
          </Toggle>
        )}
      </div>
      {messagesWithContent.length === 0 ? (
        <p>No messages available</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {messagesWithContent.map((message) => {
            let isCumulative = false;
            if (markFirstAsCumulative && !firstCustomerSeen && message.participant === "CUSTOMER") {
              firstCustomerSeen = true;
              isCumulative = true;
            }
            if (isCumulative && !showCumulative) {
              return null;
            }
            return (
              <MessageBlock
                key={message.messageId}
                message={message}
                isCumulativeTranscript={isCumulative}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
