// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  StartChatContactCommand,
} from "@aws-sdk/client-connect";
import type { ChatMessage as ConnectChatMessage } from "@aws-sdk/client-connect";
import {
  ConnectParticipantClient,
  CreateParticipantConnectionCommand,
  SendMessageCommand,
  DisconnectParticipantCommand,
} from "@aws-sdk/client-connectparticipant";
import type { AWSCredentials } from "../credentials/types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatState =
  | "idle"
  | "connecting"
  | "connected"
  | "complete"
  | "error"
  | "disconnected";

export interface ChatMessage {
  id: string;
  role: "customer" | "agent" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  contactId: string;
  participantToken: string;
  connectionToken: string;
  websocketUrl: string;
}

export interface StartChatParams {
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactFlowId: string;
  agentArn: string;
  /** Optional initial customer message. When omitted, the contact starts with no customer utterance (Lex greeting fires). */
  initialMessage?: string;
}

export interface ChatClientCallbacks {
  onStateChange: (state: ChatState) => void;
  onMessage: (message: ChatMessage) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onError: (error: string) => void;
}

// ─── WebSocket Payload Types ─────────────────────────────────────────────────

interface ChatMessagePayload {
  Type: "MESSAGE" | "EVENT";
  ParticipantRole: "AGENT" | "CUSTOMER" | "SYSTEM" | "BOT";
  ContentType: string;
  Content: string;
  DisplayName: string;
  AbsoluteTime: string;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Validate a message before sending.
 * Returns true if the string has at least 1 non-whitespace character
 * and at most 1024 total characters.
 */
export function isValidMessage(text: string): boolean {
  if (text.length > 1024) return false;
  return /\S/.test(text);
}

/**
 * Format a timestamp for display in HH:MM format using local timezone.
 */
export function formatMessageTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

// ─── Chat Lifecycle Functions ────────────────────────────────────────────────

/**
 * Start a new chat session and establish WebSocket connection.
 *
 * Flow:
 * 1. Call StartChatContact with instanceId, contactFlowId, and testAgentArn attribute
 * 2. Call CreateParticipantConnection with WEBSOCKET type
 * 3. Establish WebSocket connection
 * 4. Send initial message via SendMessage
 * 5. Invoke callbacks for state changes and messages
 */
export async function startChat(
  params: StartChatParams,
  callbacks: ChatClientCallbacks
): Promise<ChatSession> {
  const {
    credentials,
    region,
    instanceId,
    contactFlowId,
    agentArn,
    initialMessage,
  } = params;

  callbacks.onStateChange("connecting");

  try {
    // Step 1: Start the chat contact
    const connectClient = new ConnectClient({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const startChatCommand: ConstructorParameters<typeof StartChatContactCommand>[0] = {
      InstanceId: instanceId,
      ContactFlowId: contactFlowId,
      ParticipantDetails: { DisplayName: "Customer" },
      Attributes: {
        testAgentArn: agentArn.includes(":$LATEST") ? agentArn : `${agentArn}:$LATEST`,
      },
    };

    if (initialMessage) {
      startChatCommand.InitialMessage = {
        ContentType: "text/plain",
        Content: initialMessage,
      } as ConnectChatMessage;
    }

    const startChatResponse = await withRetry(
      () => connectClient.send(new StartChatContactCommand(startChatCommand)),
      DEFAULT_RETRY_CONFIG
    );

    const contactId = startChatResponse.ContactId ?? "";
    const participantToken = startChatResponse.ParticipantToken ?? "";

    // Step 2: Create participant connection
    const participantClient = new ConnectParticipantClient({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const connectionResponse = await withRetry(
      () =>
        participantClient.send(
          new CreateParticipantConnectionCommand({
            ParticipantToken: participantToken,
            Type: ["WEBSOCKET", "CONNECTION_CREDENTIALS"],
          })
        ),
      DEFAULT_RETRY_CONFIG
    );

    const connectionToken =
      connectionResponse.ConnectionCredentials?.ConnectionToken ?? "";
    const websocketUrl =
      connectionResponse.Websocket?.Url ?? "";

    // Step 3: Establish WebSocket connection
    const ws = await establishWebSocket(
      websocketUrl,
      connectionToken,
      callbacks
    );

    // Notify the customer message was sent (only if InitialMessage was passed to StartChatContact)
    if (initialMessage) {
      callbacks.onMessage({
        id: crypto.randomUUID(),
        role: "customer",
        content: initialMessage,
        timestamp: new Date(),
      });
    }

    callbacks.onStateChange("connected");

    const session: ChatSession = {
      contactId,
      participantToken,
      connectionToken,
      websocketUrl,
    };

    // Store WebSocket reference for cleanup
    activeWebSockets.set(connectionToken, ws);

    return session;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start chat";
    callbacks.onStateChange("error");
    callbacks.onError(message);
    throw error;
  }
}

/**
 * Send a message on an active chat session.
 * Calls connectparticipant:SendMessage with connectionToken, content,
 * and text/plain content type.
 */
export async function sendMessage(
  connectionToken: string,
  content: string,
  region: string,
  credentials: AWSCredentials
): Promise<void> {
  // The Participant Service ignores SigV4 and uses the ConnectionToken (X-Amz-Bearer header)
  // but the SDK v3 requires credentials to be present to construct the request
  const participantClient = new ConnectParticipantClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  await withRetry(
    () =>
      participantClient.send(
        new SendMessageCommand({
          ConnectionToken: connectionToken,
          Content: content,
          ContentType: "text/plain",
        })
      ),
    DEFAULT_RETRY_CONFIG
  );
}

/**
 * Disconnect an active chat session.
 * Calls connectparticipant:DisconnectParticipant with connectionToken.
 */
export async function disconnectChat(
  connectionToken: string,
  region: string,
  credentials: AWSCredentials
): Promise<void> {
  const participantClient = new ConnectParticipantClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  await withRetry(
    () =>
      participantClient.send(
        new DisconnectParticipantCommand({
          ConnectionToken: connectionToken,
        })
      ),
    DEFAULT_RETRY_CONFIG
  );

  // Close the WebSocket if still open
  const ws = activeWebSockets.get(connectionToken);
  if (ws) {
    ws.close();
    activeWebSockets.delete(connectionToken);
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Track active WebSocket connections for cleanup */
const activeWebSockets = new Map<string, WebSocket>();

/**
 * Close and remove a tracked WebSocket by connection token.
 * Used externally for "New Conversation" cleanup.
 */
export function closeWebSocket(connectionToken: string): void {
  const ws = activeWebSockets.get(connectionToken);
  if (ws) {
    ws.close();
    activeWebSockets.delete(connectionToken);
  }
}


/**
 * Establish a WebSocket connection with a 10-second timeout.
 * Parses incoming ChatMessagePayload events, filters system events,
 * detects EXIT_BRANCH:COMPLETE and EXIT_BRANCH:ERROR, and handles typing events.
 */
function establishWebSocket(
  url: string,
  connectionToken: string,
  callbacks: ChatClientCallbacks
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;

    // 10-second connection timeout
    const connectionTimeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timed out after 10 seconds"));
    }, 10_000);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      // Subscribe to chat topic to receive messages
      ws.send(JSON.stringify({
        topic: "aws/subscribe",
        content: { topics: ["aws/chat"] },
      }));
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(connectionTimeout);
      reject(new Error("WebSocket connection failed"));
    };

    ws.onclose = () => {
      if (typingTimeout) clearTimeout(typingTimeout);
      // Only fire disconnected if this was an unexpected close
      // (if already removed from activeWebSockets, it was intentional)
      if (activeWebSockets.has(connectionToken)) {
        activeWebSockets.delete(connectionToken);
        callbacks.onStateChange("disconnected");
      }
    };

    ws.onmessage = (event) => {
      try {
        const wsEvent = JSON.parse(event.data as string);

        // Ignore subscribe confirmation and non-chat topics
        if (wsEvent.topic !== "aws/chat") {
          return;
        }

        const contentStr = wsEvent.content ?? wsEvent.Content ?? "{}";
        // content is a JSON string for chat messages
        if (typeof contentStr !== "string") {
          return;
        }

        const payload: ChatMessagePayload = JSON.parse(contentStr);

        handleWebSocketPayload(payload, callbacks, connectionToken, () => {
          if (typingTimeout) clearTimeout(typingTimeout);
          typingTimeout = setTimeout(() => {
            callbacks.onTypingStop();
          }, 5000);
        });
      } catch (err) {
        console.warn("[TestHarness] WS message parse error:", err);
      }
    };
  });
}

/**
 * Handle a parsed WebSocket payload:
 * - Filter out SYSTEM participant events (e.g., participant.joined)
 * - Detect EXIT_BRANCH:COMPLETE → transition to "complete"
 * - Detect EXIT_BRANCH:ERROR → transition to "error"
 * - Handle typing events → invoke onTypingStart
 * - Handle AGENT/BOT text/plain messages → invoke onMessage
 */
function handleWebSocketPayload(
  payload: ChatMessagePayload,
  callbacks: ChatClientCallbacks,
  connectionToken: string,
  startTypingTimer: () => void
): void {
  // Filter system events (participant joined/left) but NOT system text messages
  if (payload.ParticipantRole === "SYSTEM" && payload.Type === "EVENT") {
    return;
  }

  // Skip CUSTOMER messages (we already display those locally)
  if (payload.ParticipantRole === "CUSTOMER") {
    return;
  }

  // Detect exit branch signals
  if (
    payload.Content &&
    payload.Content.includes("EXIT_BRANCH:COMPLETE")
  ) {
    callbacks.onStateChange("complete");
    // Close WebSocket on completion
    const ws = activeWebSockets.get(connectionToken);
    if (ws) {
      ws.close();
      activeWebSockets.delete(connectionToken);
    }
    return;
  }

  if (
    payload.Content &&
    payload.Content.includes("EXIT_BRANCH:ERROR")
  ) {
    callbacks.onStateChange("error");
    callbacks.onError("The agent encountered an error");
    const ws = activeWebSockets.get(connectionToken);
    if (ws) {
      ws.close();
      activeWebSockets.delete(connectionToken);
    }
    return;
  }

  // Handle typing events
  if (
    payload.Type === "EVENT" &&
    payload.ContentType ===
      "application/vnd.amazonaws.connect.event.typing"
  ) {
    callbacks.onTypingStart();
    startTypingTimer();
    return;
  }

  // Handle agent/bot/system messages
  if (
    payload.Type === "MESSAGE" &&
    (payload.ParticipantRole === "AGENT" || payload.ParticipantRole === "BOT" || payload.ParticipantRole === "SYSTEM") &&
    payload.ContentType === "text/plain"
  ) {
    callbacks.onMessage({
      id: crypto.randomUUID(),
      role: "agent",
      content: payload.Content,
      timestamp: new Date(payload.AbsoluteTime),
    });
    // Stop typing indicator when a message arrives
    callbacks.onTypingStop();
    return;
  }
}
