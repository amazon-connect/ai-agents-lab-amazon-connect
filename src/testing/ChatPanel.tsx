// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useCallback } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Container from "@cloudscape-design/components/container";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs from "@cloudscape-design/components/tabs";

import type { ChatMessage, ChatState } from "../test-harness/chat-client";
import { formatMessageTime } from "../test-harness/chat-client";

export interface ChatPanelProps {
  /** Array of messages to display */
  messages: ChatMessage[];
  /** Current chat state */
  chatState: ChatState;
  /** Whether agent is typing */
  isTyping: boolean;
  /** Current input value */
  inputValue: string;
  /** Input change handler */
  onInputChange: (value: string) => void;
  /** Send message handler */
  onSend: () => void;
  /** New conversation handler */
  onNewConversation: () => void;
  /** Error message from failed send */
  sendError: string | null;
  /** Whether the input is fully disabled (no agent selected, infra not ready) */
  disabled?: boolean;
  /** Whether to hide the input area (used in script mode) */
  hideInput?: boolean;
  /** Whether to hide the New Conversation button (used in script/batch mode) */
  hideNewConversation?: boolean;
  /** Save conversation as script handler */
  onSaveAsScript?: () => void;
  /** Agent name for export reference modal */
  agentName?: string;
  /** Contact ID for the current chat session */
  contactId?: string | null;
  /** Optional evaluation form tab content — when provided, ChatPanel renders a tabbed view */
  evaluationFormPanel?: React.ReactNode;
  /** Whether the evaluation form tab is active */
  evaluationFormTabActive?: boolean;
  /** Callback when tab changes */
  onTabChange?: (tabId: string) => void;
  /** Handler for "Create evaluation form" dropdown click */
  onCreateEvaluationForm?: () => void;
}

/**
 * Chat conversation panel with message bubbles, status indicators, and input field.
 * Displays messages chronologically with auto-scroll behaviour.
 * Supports an optional tabbed layout when an evaluation form panel is provided.
 */
export default function ChatPanel({
  messages,
  chatState,
  isTyping,
  inputValue,
  onInputChange,
  onSend,
  onNewConversation,
  onSaveAsScript,
  agentName: _agentName,
  sendError,
  disabled = false,
  hideInput = false,
  hideNewConversation = false,
  contactId,
  evaluationFormPanel,
  evaluationFormTabActive = false,
  onTabChange,
  onCreateEvaluationForm,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Sort messages chronologically (ascending - earliest at top)
  const sortedMessages = [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Track whether user has scrolled up from the bottom
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Consider "at bottom" if within 50px of the bottom
    userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 50;
  }, []);

  // Auto-scroll to bottom on new messages unless user has scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Determine if input should be disabled (only enabled when connected)
  const isInputDisabled =
    disabled ||
    chatState !== "connected";

  // Always show "New Conversation" button (it starts a fresh session)
  const showNewConversation = !disabled && !hideNewConversation && !evaluationFormTabActive;

  // Handle Enter key press
  const handleKeyDown = (event: CustomEvent<{ key: string }>) => {
    if (
      event.detail.key === "Enter" &&
      !isInputDisabled &&
      inputValue.trim().length > 0
    ) {
      onSend();
    }
  };

  // Determine whether input area should be shown
  const shouldHideInput = hideInput || evaluationFormTabActive;

  // Build conversation content (messages area)
  const conversationContent = (
    <>
      {/* Contact ID */}
      {contactId && (
        <Box variant="small" color="text-body-secondary" textAlign="right">
          Contact: {contactId}
        </Box>
      )}
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{
          height: "450px",
          overflowY: "auto",
          padding: "8px 0",
        }}
      >
        {sortedMessages.length === 0 && !isTyping ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "16px",
            }}
          >
            <img
              src="/bedrock-icon.svg"
              alt="Amazon Bedrock"
              width="80"
              height="80"
              style={{ opacity: 0.7 }}
            />
            <Box variant="p" color="text-body-secondary" textAlign="center">
              <span style={{ opacity: 0.5 }}>Select an agent and click &quot;New Conversation&quot; to start</span>
            </Box>
          </div>
        ) : (
        <SpaceBetween size="s">
          {sortedMessages.map((message) =>
            message.role === "system" ? (
              <SystemBanner key={message.id} message={message} />
            ) : (
              <MessageBubble key={message.id} message={message} />
            )
          )}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </SpaceBetween>
        )}
      </div>
    </>
  );

  // Build dropdown items
  const dropdownItems = [];
  if (onSaveAsScript) {
    dropdownItems.push({ id: "save-as-script", text: "Save as Script", disabled: messages.length === 0 });
  }
  if (onCreateEvaluationForm) {
    const hasBothRoles = messages.some((m) => m.role === "customer") && messages.some((m) => m.role === "agent");
    dropdownItems.push({
      id: "create-evaluation-form",
      text: "Create evaluation form",
      disabled: !hasBothRoles,
      disabledReason: "Both customer and agent messages are required",
    });
  }

  return (
    <Container>
      <SpaceBetween size="m">
        {/* Tabbed or plain content area */}
        {evaluationFormPanel != null ? (
          <Tabs
            activeTabId={evaluationFormTabActive ? "evaluation-form" : "conversation"}
            onChange={({ detail }) => onTabChange?.(detail.activeTabId)}
            tabs={[
              {
                id: "conversation",
                label: "Conversation",
                content: conversationContent,
              },
              {
                id: "evaluation-form",
                label: "Generated Evaluation Form",
                content: <>{evaluationFormPanel}</>,
              },
            ]}
          />
        ) : (
          conversationContent
        )}

        {/* Send error */}
        {!shouldHideInput && sendError && (
          <Box color="text-status-error">
            <StatusIndicator type="error">{sendError}</StatusIndicator>
          </Box>
        )}

        {/* New Conversation button */}
        {showNewConversation && (
          <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
            <Button
              onClick={onNewConversation}
              disabled={chatState === "connecting"}
              loading={chatState === "connecting"}
            >
              {chatState === "connecting" ? "Starting conversation..." : "New Conversation"}
            </Button>
          </div>
        )}

        {/* Input area — hidden when evaluation form tab is active */}
        {!shouldHideInput && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <Input
              value={inputValue}
              onChange={({ detail }) => onInputChange(detail.value)}
              onKeyDown={handleKeyDown as never}
              placeholder="Type a message..."
              disabled={isInputDisabled}
            />
          </div>
          <ConnectionDot chatState={chatState} isTyping={isTyping} />
          <Button
            variant="primary"
            onClick={onSend}
            disabled={isInputDisabled || inputValue.trim().length === 0}
          >
            Send
          </Button>
          {dropdownItems.length > 0 && (
            <ButtonDropdown
              variant="icon"
              items={dropdownItems}
              onItemClick={({ detail }) => {
                if (detail.id === "save-as-script") {
                  onSaveAsScript?.();
                } else if (detail.id === "create-evaluation-form") {
                  onCreateEvaluationForm?.();
                }
              }}
              ariaLabel="More actions"
            />
          )}
        </div>
        )}
      </SpaceBetween>
    </Container>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isCustomer = message.role === "customer";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isCustomer ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "75%",
          padding: "6px 10px",
          borderRadius: isCustomer ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          backgroundColor: isCustomer ? "#0972d3" : "#e9ebed",
          color: isCustomer ? "#ffffff" : "#000716",
          fontSize: "13px",
          lineHeight: "1.4",
        }}
      >
        <span>{message.content}</span>
        <span
          style={{
            display: "block",
            fontSize: "10px",
            opacity: 0.6,
            marginTop: "2px",
            textAlign: isCustomer ? "right" : "left",
          }}
        >
          {formatMessageTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <Box color="text-status-inactive" variant="small">
        <StatusIndicator type="loading">Agent is typing...</StatusIndicator>
      </Box>
    </div>
  );
}

function SystemBanner({ message }: { message: ChatMessage }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "8px 0",
      }}
    >
      <div
        style={{
          backgroundColor: "#f2f3f3",
          border: "1px solid #e9ebed",
          borderRadius: "8px",
          padding: "6px 16px",
          fontSize: "12px",
          color: "#5f6b7a",
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

interface ChatStatusIndicatorProps {
  chatState: ChatState;
  isTyping: boolean;
}

function ConnectionDot({ chatState }: ChatStatusIndicatorProps) {
  let color = "#d1d5db"; // grey — idle
  let title = "Idle";

  if (chatState === "connecting") {
    color = "#f59e0b"; // amber — connecting
    title = "Connecting";
  } else if (chatState === "connected") {
    color = "#10b981"; // green — connected
    title = "Connected";
  } else if (chatState === "error") {
    color = "#ef4444"; // red — error
    title = "Error";
  } else if (chatState === "disconnected") {
    color = "#f59e0b"; // amber — disconnected
    title = "Disconnected";
  } else if (chatState === "complete") {
    color = "#6b7280"; // grey — ended
    title = "Conversation ended";
  }

  return (
    <div
      title={title}
      style={{
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}
