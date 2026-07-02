// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Badge from "@cloudscape-design/components/badge";
import type { Message, MessageValue } from "../sessions/types";
import { CodeDisplay } from "./CodeDisplay";

export interface MessageBlockProps {
  /** The message to render */
  message: Message;
  /** If true, shows a "Cumulative transcript" label — used for the first CUSTOMER message in input */
  isCumulativeTranscript?: boolean;
}

function renderValue(value: MessageValue, index: number) {
  if ("text" in value) {
    return (
      <p key={index} style={{ margin: "4px 0" }}>
        {value.text.value}
      </p>
    );
  }

  if ("toolUse" in value) {
    return (
      <div key={index} style={{ margin: "4px 0" }}>
        <strong>Tool: {value.toolUse.name}</strong>
        <CodeDisplay content={value.toolUse.arguments} />
      </div>
    );
  }

  if ("toolResult" in value) {
    return (
      <div key={index} style={{ margin: "4px 0" }}>
        <strong>Tool Result ({value.toolResult.toolUseId})</strong>
        {value.toolResult.values.map((v, i) => (
          <CodeDisplay key={i} content={v.text.value} />
        ))}
      </div>
    );
  }

  return null;
}

/**
 * Renders a single message block with a participant badge header
 * and all message values in their original array order.
 */
export function MessageBlock({ message, isCumulativeTranscript }: MessageBlockProps) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
        <Badge color={message.participant === "CUSTOMER" ? "blue" : "green"}>
          {message.participant}
        </Badge>
        {isCumulativeTranscript && (
          <Badge color="grey">Cumulative transcript</Badge>
        )}
      </div>
      {message.values.map((value, index) => renderValue(value, index))}
    </div>
  );
}
