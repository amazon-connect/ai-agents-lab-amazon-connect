// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  QConnectClient,
  ListSpansCommand,
} from "@aws-sdk/client-qconnect";
import type { AWSCredentials } from "../credentials/types";
import type { Span } from "./types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

const MAX_PAGES = 50;

export interface ListSpansParams {
  credentials: AWSCredentials;
  region: string;
  assistantId: string;
  sessionId: string;
  signal?: AbortSignal;
}

/**
 * Fetches all spans for a session by paginating through the ListSpans API.
 *
 * Creates a QConnectClient per call to ensure region/credentials are current.
 * Uses withRetry with DEFAULT_RETRY_CONFIG for throttling errors.
 * Respects AbortSignal for cancellation on unmount.
 * Accumulates all spans from all pages into a single array.
 */
export async function listAllSpans(params: ListSpansParams): Promise<Span[]> {
  const { credentials, region, assistantId, sessionId, signal } = params;

  const client = new QConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const spans: Span[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const response = await withRetry(
      () =>
        client.send(
          new ListSpansCommand({
            assistantId,
            sessionId,
            nextToken,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    if (response.spans) {
      for (const raw of response.spans) {
        spans.push({
          spanId: raw.spanId ?? "",
          parentSpanId: raw.parentSpanId ?? undefined,
          spanName: (raw.spanName as Span["spanName"]) ?? "invoke_agent",
          spanType: (raw.spanType as Span["spanType"]) ?? "SERVER",
          startTimestamp: raw.startTimestamp
            ? raw.startTimestamp.toISOString()
            : "",
          endTimestamp: raw.endTimestamp
            ? raw.endTimestamp.toISOString()
            : "",
          status: raw.status ?? "",
          requestId: raw.requestId ?? undefined,
          originRequestId: raw.originRequestId ?? "",
          attributes: mapAttributes(raw.attributes),
        });
      }
    }

    nextToken = response.nextToken;
    if (!nextToken) {
      break;
    }
  }

  return spans;
}

/**
 * Maps raw SDK span attributes to our internal SpanAttributes type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAttributes(raw: any): Span["attributes"] {
  if (!raw) return {};

  return {
    operationName: raw.operationName as string | undefined,
    providerName: raw.providerName as string | undefined,
    instanceArn: raw.instanceArn as string | undefined,
    contactId: raw.contactId as string | undefined,
    initialContactId: raw.initialContactId as string | undefined,
    sessionName: raw.sessionName as string | undefined,
    aiAgentArn: raw.aiAgentArn as string | undefined,
    aiAgentType: raw.aiAgentType as string | undefined,
    aiAgentName: raw.aiAgentName as string | undefined,
    aiAgentId: raw.aiAgentId as string | undefined,
    aiAgentVersion: raw.aiAgentVersion as string | undefined,
    aiAgentOrchestratorUseCase: raw.aiAgentOrchestratorUseCase as
      | string
      | undefined,
    requestModel: raw.requestModel as string | undefined,
    requestMaxTokens: raw.requestMaxTokens as number | undefined,
    temperature: raw.temperature as number | undefined,
    responseFinishReasons: raw.responseFinishReasons as string[] | undefined,
    usageInputTokens: raw.usageInputTokens as number | undefined,
    usageOutputTokens: raw.usageOutputTokens as number | undefined,
    usageTotalTokens: raw.usageTotalTokens as number | undefined,
    cacheReadInputTokens: raw.cacheReadInputTokens as number | undefined,
    cacheWriteInputTokens: raw.cacheWriteInputTokens as number | undefined,
    timeToFirstTokenMs: raw.timeToFirstTokenMs as number | undefined,
    inputMessages: raw.inputMessages as Span["attributes"]["inputMessages"],
    outputMessages: raw.outputMessages as Span["attributes"]["outputMessages"],
    systemInstructions: raw.systemInstructions as
      | Array<{ text: { value: string } }>
      | undefined,
    promptArn: raw.promptArn as string | undefined,
    promptId: raw.promptId as string | undefined,
    promptType: raw.promptType as string | undefined,
    promptName: raw.promptName as string | undefined,
    promptVersion: raw.promptVersion as string | undefined,
  };
}
