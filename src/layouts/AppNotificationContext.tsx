// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";

// ─── Error Classification ────────────────────────────────────────────────────

export type ApiErrorKind = "session_expired" | "access_denied" | "unknown";

/**
 * Classify an AWS SDK error into a known category.
 */
export function classifyError(err: unknown): {
  kind: ApiErrorKind;
  action?: string;
  message: string;
} {
  if (!(err instanceof Error)) {
    return { kind: "unknown", message: String(err) };
  }

  const name = err.name ?? "";
  const message = err.message ?? "";

  // Expired credentials — need to refresh or re-authenticate
  if (
    name === "ExpiredTokenException" ||
    name === "InvalidIdentityToken" ||
    name === "ExpiredToken" ||
    message.includes("security token included in the request is expired") ||
    message.includes("Token has expired")
  ) {
    return { kind: "session_expired", message: "Your session has expired." };
  }

  // Access denied — valid creds but missing IAM permission
  if (
    name === "AccessDeniedException" ||
    name === "AccessDenied" ||
    name === "UnauthorizedAccessException" ||
    name === "ForbiddenException" ||
    name.includes("AccessDenied") ||
    message.includes("is not authorized to perform") ||
    message.includes("Access Denied")
  ) {
    // Try to extract the action from the message
    const actionMatch = message.match(/to perform: ([a-zA-Z0-9:]+)/);
    const action = actionMatch?.[1] ?? undefined;
    return {
      kind: "access_denied",
      action,
      message: action
        ? `Access denied: you don't have permission for ${action}`
        : "Access denied: check your IAM permissions",
    };
  }

  return { kind: "unknown", message: message || "An unexpected error occurred" };
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppNotificationContextValue {
  /** Report an API error — it will be classified and shown as a flash message */
  reportError: (err: unknown) => void;
  /** Current flash messages to render */
  messages: FlashbarProps.MessageDefinition[];
  /** Dismiss all messages */
  clearAll: () => void;
}

const AppNotificationContext = createContext<AppNotificationContextValue>({
  reportError: () => {},
  messages: [],
  clearAll: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

interface AppNotificationProviderProps {
  children: ReactNode;
  /** Called when the user clicks "Re-authenticate" */
  onReauthenticate: () => void;
  /** Called when the user clicks "Check permissions" */
  onNavigateToPermissions: () => void;
}

export function AppNotificationProvider({
  children,
  onReauthenticate,
  onNavigateToPermissions,
}: AppNotificationProviderProps) {
  const [messages, setMessages] = useState<FlashbarProps.MessageDefinition[]>([]);

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setMessages([]);
  }, []);

  const reportError = useCallback(
    (err: unknown) => {
      const classified = classifyError(err);
      const id = crypto.randomUUID();

      // Deduplicate: don't show the same kind of message if one is already visible
      setMessages((prev) => {
        if (classified.kind === "session_expired" && prev.some((m) => m.id?.startsWith("session-expired"))) {
          return prev;
        }

        const newMessage: FlashbarProps.MessageDefinition = {
          id: classified.kind === "session_expired" ? `session-expired-${id}` : id,
          type: "error",
          dismissible: true,
          onDismiss: () => dismiss(classified.kind === "session_expired" ? `session-expired-${id}` : id),
          content: classified.message,
        };

        if (classified.kind === "session_expired") {
          newMessage.buttonText = "Re-authenticate";
          newMessage.onButtonClick = () => {
            onReauthenticate();
          };
        } else if (classified.kind === "access_denied") {
          newMessage.buttonText = "Check permissions";
          newMessage.onButtonClick = () => {
            onNavigateToPermissions();
          };
        }

        return [...prev, newMessage];
      });
    },
    [dismiss, onReauthenticate, onNavigateToPermissions]
  );

  return (
    <AppNotificationContext.Provider value={{ reportError, messages, clearAll }}>
      {children}
    </AppNotificationContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAppNotifications() {
  return useContext(AppNotificationContext);
}
