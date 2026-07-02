// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  QConnectClient,
  ListAssistantsCommand,
} from "@aws-sdk/client-qconnect";
import type { ListAssistantsOptions, AssistantSummary } from "./types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "./retry";

const MAX_PAGES = 50;
const MAX_RESULTS_PER_PAGE = 100;

/**
 * Lists all Amazon Connect AI Agents assistants for the specified region.
 *
 * Creates a QConnectClient for the given region, paginates through all results
 * (up to 50 pages, 100 items per page), applies retry logic for throttling errors,
 * and respects AbortSignal for cancellation.
 */
export async function listAssistants(
  options: ListAssistantsOptions
): Promise<AssistantSummary[]> {
  const { credentials, region, signal } = options;

  const client = new QConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    ...(signal ? { abortSignal: signal } : {}),
  });

  const assistants: AssistantSummary[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const response = await withRetry(
      () =>
        client.send(
          new ListAssistantsCommand({
            maxResults: MAX_RESULTS_PER_PAGE,
            nextToken,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    if (response.assistantSummaries) {
      for (const summary of response.assistantSummaries) {
        assistants.push({
          assistantId: summary.assistantId ?? "",
          name: summary.name ?? "",
          type: summary.type ?? "",
          status: summary.status ?? "",
          assistantArn: summary.assistantArn ?? "",
        });
      }
    }

    nextToken = response.nextToken;
    if (!nextToken) {
      break;
    }
  }

  return assistants;
}
