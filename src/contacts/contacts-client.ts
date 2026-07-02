// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  SearchContactsCommand,
  DescribeContactCommand,
} from "@aws-sdk/client-connect";
import type { ContactSearchSummary } from "@aws-sdk/client-connect";
import type { AWSCredentials } from "../credentials/types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

export interface SearchContactsParams {
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  startTime: Date;
  endTime: Date;
  maxResults?: number;
  nextToken?: string;
  signal?: AbortSignal;
}

export interface ContactSearchResult {
  contacts: ContactSummary[];
  nextToken: string | undefined;
  totalCount: number;
}

export interface ContactSummary {
  contactId: string;
  initiationTimestamp: Date | null;
  disconnectTimestamp: Date | null;
  channel: string;
  initiationMethod: string;
}

export interface DescribeContactParams {
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactId: string;
  signal?: AbortSignal;
}

export interface ContactWisdomInfo {
  sessionArn: string;
  aiAgents: AiAgentInfo[];
}

export interface AiAgentInfo {
  aiAgentVersionId: string;
  aiUseCase: "SelfService" | "AgentAssistance";
  aiAgentEscalated: boolean;
}

/**
 * Maps a raw ContactSearchSummary from the API to our internal ContactSummary.
 * Exported for testability (property tests).
 */
export function mapContact(raw: ContactSearchSummary): ContactSummary {
  return {
    contactId: raw.Id ?? "",
    initiationTimestamp: raw.InitiationTimestamp ?? null,
    disconnectTimestamp: raw.DisconnectTimestamp ?? null,
    channel: raw.Channel ?? "",
    initiationMethod: raw.InitiationMethod ?? "",
  };
}

/**
 * Calls SearchContacts with retry logic for throttling errors.
 * Uses INITIATION_TIMESTAMP as the time range type.
 * Creates a new ConnectClient per call to ensure region/credentials are current.
 */
export async function searchContacts(
  params: SearchContactsParams
): Promise<ContactSearchResult> {
  const {
    credentials,
    region,
    instanceId,
    startTime,
    endTime,
    maxResults = 100,
    nextToken,
    signal,
  } = params;

  const client = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const response = await withRetry(
    () =>
      client.send(
        new SearchContactsCommand({
          InstanceId: instanceId,
          TimeRange: {
            Type: "INITIATION_TIMESTAMP",
            StartTime: startTime,
            EndTime: endTime,
          },
          MaxResults: maxResults,
          NextToken: nextToken,
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  return {
    contacts: (response.Contacts ?? []).map(mapContact),
    nextToken: response.NextToken ?? undefined,
    totalCount: response.TotalCount ?? 0,
  };
}

/**
 * Calls DescribeContact to retrieve WisdomInfo for a specific contact.
 * Returns the session ARN and AI agent details if the contact has an AI session,
 * or null if no WisdomInfo is present.
 * Creates a new ConnectClient per call to ensure region/credentials are current.
 */
export async function describeContact(
  params: DescribeContactParams
): Promise<ContactWisdomInfo | null> {
  const { credentials, region, instanceId, contactId, signal } = params;

  const client = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const response = await withRetry(
    () =>
      client.send(
        new DescribeContactCommand({
          InstanceId: instanceId,
          ContactId: contactId,
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const wisdomInfo = response.Contact?.WisdomInfo;
  if (!wisdomInfo?.SessionArn) {
    return null;
  }

  return {
    sessionArn: wisdomInfo.SessionArn,
    aiAgents: (wisdomInfo.AiAgents ?? []).map((agent) => ({
      aiAgentVersionId: agent.AiAgentVersionId ?? "",
      aiUseCase: (agent.AiUseCase as "SelfService" | "AgentAssistance") ?? "SelfService",
      aiAgentEscalated: agent.AiAgentEscalated ?? false,
    })),
  };
}
