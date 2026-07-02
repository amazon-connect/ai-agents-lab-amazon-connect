// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { useCredentials } from "../credentials/CredentialsContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useAppNotifications } from "../layouts/AppNotificationContext";
import { describeContact } from "../contacts/contacts-client";
import { parseSessionArn } from "./arn-parser";
import { listAllSpans } from "./spans-client";
import { buildSpanTree } from "./span-tree-builder";
import type {
  SessionState,
  SessionNavigationState,
  AiAgentInfo,
} from "./types";

/**
 * Determines if an error is an expired credential error that can be retried
 * after refreshing credentials.
 */
function isExpiredCredentialError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.name === "ExpiredTokenException" ||
      err.name === "InvalidIdentityToken"
    );
  }
  return false;
}

/**
 * Determines if an error is an access denied error (non-retryable).
 */
function isAccessDeniedError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AccessDeniedException";
  }
  return false;
}

/**
 * Determines if an error is an abort error (user navigated away).
 */
function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AbortError" || err.message === "Aborted";
  }
  return false;
}

/**
 * Custom hook that orchestrates the full session resolution flow:
 * 1. Reads session ARN from React Router navigation state (primary path)
 * 2. Falls back to DescribeContact for direct URL access
 * 3. Parses the ARN to extract assistantId and sessionId
 * 4. Fetches all spans via paginated ListSpans API
 * 5. Builds a hierarchical span tree
 *
 * Handles credential refresh on ExpiredTokenException, abort on unmount,
 * and various error states.
 */
export function useSessionResolver(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const location = useLocation();
  const { id: contactId } = useParams<{ id: string }>();
  const { credentials, refresh: refreshCredentials } = useCredentials();
  const { instance, region } = useWorkspace();

  const abortControllerRef = useRef<AbortController | null>(null);
  const hasRetriedRef = useRef(false);
  const { reportError } = useAppNotifications();

  const resolve = useCallback(async () => {
    if (!credentials || !instance || !region || !contactId) {
      return;
    }

    // Create a new AbortController for this resolution attempt
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    setState({ status: "loading" });
    hasRetriedRef.current = false;

    try {
      // Step 1: Resolve the session ARN
      const navState = location.state as SessionNavigationState | null;
      let sessionArn: string | undefined;
      let aiAgents: AiAgentInfo[] = [];
      let channel: string | undefined;

      if (navState?.sessionArn) {
        // Primary path: ARN from navigation state
        sessionArn = navState.sessionArn;
        aiAgents = navState.aiAgents ?? [];
        channel = navState.channel;
      } else {
        // Fallback path: call DescribeContact
        const wisdomInfo = await describeContact({
          credentials,
          region,
          instanceId: instance.instanceId,
          contactId,
          signal,
        });

        if (signal.aborted) return;

        if (!wisdomInfo) {
          setState({ status: "no-session", contactId });
          return;
        }

        sessionArn = wisdomInfo.sessionArn;
        aiAgents = wisdomInfo.aiAgents;
      }

      // Step 2: Parse the ARN
      const parseResult = parseSessionArn(sessionArn);
      if (!parseResult.ok) {
        const detail =
          parseResult.error.type === "missing_input"
            ? "Session ARN is missing"
            : parseResult.error.detail;
        setState({
          status: "error",
          message: `Invalid session data: ${detail}`,
          retryable: false,
        });
        return;
      }

      const { assistantId, sessionId } = parseResult.value;

      // Step 3: Fetch all spans
      const spans = await listAllSpans({
        credentials,
        region,
        assistantId,
        sessionId,
        signal,
      });

      if (signal.aborted) return;

      // Step 4: Handle empty spans
      if (spans.length === 0) {
        setState({ status: "empty" });
        return;
      }

      // Step 5: Build the span tree
      const tree = buildSpanTree(spans);

      setState({
        status: "ready",
        tree,
        metadata: {
          contactId,
          sessionId,
          assistantId,
          aiAgents,
          totalSpans: tree.totalCount,
          rootSpanCount: tree.roots.length,
          channel,
        },
      });
    } catch (err: unknown) {
      if (signal.aborted) return;

      // Handle AbortError silently
      if (isAbortError(err)) {
        return;
      }

      // Handle expired credentials: refresh and retry once
      if (isExpiredCredentialError(err) && !hasRetriedRef.current) {
        hasRetriedRef.current = true;
        try {
          await refreshCredentials();
          if (!signal.aborted) {
            void resolve();
          }
        } catch (refreshErr) {
          if (!signal.aborted) {
            reportError(refreshErr);
            setState({
              status: "error",
              message: "Session expired. Please re-authenticate.",
              retryable: false,
            });
          }
        }
        return;
      }

      // Handle access denied: non-retryable
      if (isAccessDeniedError(err)) {
        reportError(err);
        setState({
          status: "error",
          message: "Insufficient permissions to access this resource.",
          retryable: false,
        });
        return;
      }

      // Generic error: retryable
      reportError(err);
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setState({
        status: "error",
        message,
        retryable: true,
      });
    }
  }, [credentials, instance, region, contactId, location.state, refreshCredentials, reportError]);

  // Run resolution on mount and when dependencies change
  useEffect(() => {
    void resolve();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [resolve]);

  return state;
}
