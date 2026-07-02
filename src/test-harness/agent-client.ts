// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { QConnectClient, ListAIAgentsCommand, GetAIAgentCommand, GetAIPromptCommand, GetAssistantCommand } from "@aws-sdk/client-qconnect";
import type { AWSCredentials } from "../credentials/types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

/**
 * Represents a customer-facing AI Agent (SELF_SERVICE or ORCHESTRATION).
 */
export interface AIAgent {
  agentId: string;
  name: string;
  type: "SELF_SERVICE" | "ORCHESTRATION";
  arn: string;
}

/**
 * Parameters for listing AI agents from Amazon Connect AI Agents.
 */
export interface ListAgentsParams {
  credentials: AWSCredentials;
  region: string;
  assistantId: string;
  signal?: AbortSignal;
}

/** Customer-facing agent types that can be tested via chat */
const CUSTOMER_FACING_TYPES = new Set(["SELF_SERVICE", "ORCHESTRATION"]);

/**
 * List customer-facing AI agents (SELF_SERVICE and ORCHESTRATION only).
 * Paginates through all results from the ListAIAgents API and filters
 * to only customer-facing types.
 */
export async function listCustomerFacingAgents(
  params: ListAgentsParams
): Promise<AIAgent[]> {
  const { credentials, region, assistantId, signal } = params;

  const client = new QConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const allAgents: Array<{
    name: string;
    type: string;
    arn: string;
    agentId: string;
  }> = [];

  let nextToken: string | undefined;

  do {
    const response = await withRetry(
      () =>
        client.send(
          new ListAIAgentsCommand({
            assistantId,
            nextToken,
            maxResults: 100,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    for (const agent of response.aiAgentSummaries ?? []) {
      allAgents.push({
        name: agent.name ?? "",
        type: agent.type ?? "",
        arn: agent.aiAgentArn ?? "",
        agentId: agent.aiAgentId ?? "",
      });
    }

    nextToken = response.nextToken;
  } while (nextToken);

  return filterCustomerFacingAgents(allAgents);
}

/**
 * Filter agents to only customer-facing types (SELF_SERVICE and ORCHESTRATION).
 * Preserves original order.
 */
export function filterCustomerFacingAgents(
  agents: Array<{ name: string; type: string; arn: string; agentId: string }>
): AIAgent[] {
  return agents
    .filter((agent) => CUSTOMER_FACING_TYPES.has(agent.type))
    .map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      type: agent.type as "SELF_SERVICE" | "ORCHESTRATION",
      arn: agent.arn,
    }));
}

/**
 * Format agent for display: "name (type)"
 */
export function formatAgentLabel(agent: AIAgent): string {
  return `${agent.name} (${agent.type})`;
}


/**
 * Parameters for fetching the system prompt of an AI agent.
 */
export interface GetAgentSystemPromptParams {
  credentials: AWSCredentials;
  region: string;
  assistantId: string;
  agentId: string;
  agentType: "SELF_SERVICE" | "ORCHESTRATION";
  signal?: AbortSignal;
}

/**
 * Fetch the system prompt text for an AI agent.
 *
 * Resolves the active (published) prompt by:
 * 1. GetAssistant → get the versioned agent ID from aiAgentConfiguration for the agent type
 * 2. GetAIAgent (with versioned ID) → extract the primary AI prompt ID from the agent's configuration
 * 3. GetAIPrompt → extract the prompt text from the template configuration
 *
 * This ensures we fetch the exact prompt version that is currently active on
 * the assistant — not the DRAFT, which may have been modified since.
 *
 * Falls back to the DRAFT agent (base agentId) if no versioned agent is
 * configured on the assistant (e.g., during initial development).
 *
 * Returns the prompt text, or null if the prompt cannot be resolved
 * (e.g., unsupported agent type, missing configuration, permission error).
 */
export async function getAgentSystemPrompt(
  params: GetAgentSystemPromptParams
): Promise<string | null> {
  const { credentials, region, assistantId, agentId, agentType, signal } = params;

  const client = new QConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    // Step 1: Get the assistant to find the versioned agent ID for this agent type
    let resolvedAgentId = agentId; // fallback to DRAFT

    const assistantResponse = await withRetry(
      () =>
        client.send(
          new GetAssistantCommand({ assistantId }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const agentConfig = assistantResponse.assistant?.aiAgentConfiguration;
    if (agentConfig && agentConfig[agentType]?.aiAgentId) {
      resolvedAgentId = agentConfig[agentType]!.aiAgentId!;
    }

    // Step 2: Get the AI agent configuration (using versioned ID if available)
    const agentResponse = await withRetry(
      () =>
        client.send(
          new GetAIAgentCommand({ assistantId, aiAgentId: resolvedAgentId }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const config = agentResponse.aiAgent?.configuration;
    if (!config) return null;

    // Extract the primary prompt ID based on agent type
    let promptId: string | undefined;

    if ("orchestrationAIAgentConfiguration" in config && config.orchestrationAIAgentConfiguration) {
      promptId = config.orchestrationAIAgentConfiguration.orchestrationAIPromptId;
    } else if ("selfServiceAIAgentConfiguration" in config && config.selfServiceAIAgentConfiguration) {
      promptId = config.selfServiceAIAgentConfiguration.selfServiceAnswerGenerationAIPromptId;
    } else if ("answerRecommendationAIAgentConfiguration" in config && config.answerRecommendationAIAgentConfiguration) {
      promptId = config.answerRecommendationAIAgentConfiguration.answerGenerationAIPromptId;
    } else if ("manualSearchAIAgentConfiguration" in config && config.manualSearchAIAgentConfiguration) {
      promptId = config.manualSearchAIAgentConfiguration.answerGenerationAIPromptId;
    }

    if (!promptId) return null;

    // Step 3: Get the AI prompt text
    const promptResponse = await withRetry(
      () =>
        client.send(
          new GetAIPromptCommand({ assistantId, aiPromptId: promptId! }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const templateConfig = promptResponse.aiPrompt?.templateConfiguration;
    if (!templateConfig) return null;

    if ("textFullAIPromptEditTemplateConfiguration" in templateConfig && templateConfig.textFullAIPromptEditTemplateConfiguration) {
      return templateConfig.textFullAIPromptEditTemplateConfiguration.text ?? null;
    }

    return null;
  } catch {
    // Gracefully return null on any error (permission, not found, etc.)
    return null;
  }
}
