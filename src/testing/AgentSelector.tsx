// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from "react";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import FormField from "@cloudscape-design/components/form-field";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";

import type { AWSCredentials } from "../credentials/types";
import {
  type AIAgent,
  listCustomerFacingAgents,
  formatAgentLabel,
} from "../test-harness/agent-client";
import { HelpIcon } from "../contextual-help";
import { useAppNotifications, classifyError } from "../layouts/AppNotificationContext";

export interface AgentSelectorProps {
  /** AWS credentials for API calls */
  credentials: AWSCredentials;
  /** AWS region */
  region: string;
  /** Amazon Connect AI Agents assistant ID */
  assistantId: string;
  /** Whether infrastructure is ready (only fetch agents when true) */
  isReady: boolean;
  /** Callback when an agent is selected */
  onSelect: (agent: AIAgent) => void;
  /** Currently selected agent */
  selectedAgent: AIAgent | null;
}

type LoadingState = "idle" | "loading" | "loaded" | "error" | "empty";

/**
 * Dropdown for selecting a customer-facing AI Agent from Amazon Connect AI Agents.
 * Fetches agents when infrastructure is ready and displays them in a Cloudscape Select.
 */
export default function AgentSelector({
  credentials,
  region,
  assistantId,
  onSelect,
  selectedAgent,
}: AgentSelectorProps) {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { reportError } = useAppNotifications();

  const fetchAgents = useCallback(async () => {
    setLoadingState("loading");
    setErrorMessage("");

    try {
      const result = await listCustomerFacingAgents({
        credentials,
        region,
        assistantId,
      });

      if (result.length === 0) {
        setAgents([]);
        setLoadingState("empty");
      } else {
        setAgents(result);
        setLoadingState("loaded");
      }
    } catch (err) {
      reportError(err);
      const classified = classifyError(err);
      // For session-expired and access-denied, the banner handles it — don't
      // show a redundant inline error message. Just mark as error silently.
      if (classified.kind === "unknown") {
        const message =
          err instanceof Error ? err.message : "Failed to load agents";
        setErrorMessage(message);
      }
      setLoadingState("error");
    }
  }, [credentials, region, assistantId, reportError]);

  useEffect(() => {
    if (assistantId) {
      fetchAgents();
    }
  }, [assistantId, fetchAgents]);

  const handleChange: SelectProps["onChange"] = ({ detail }) => {
    const agent = agents.find((a) => a.agentId === detail.selectedOption.value);
    if (agent) {
      onSelect(agent);
    }
  };

  // Not ready yet — show selector but it won't enable chat until infra is ready
  // (handled by the disabled prop on ChatPanel)

  const agentLabel = (
    <span>
      AI Agent{" "}
      <HelpIcon anchorId="ai-agent" pageId="testing" fieldName="AI Agent" />
    </span>
  );

  // Error state
  if (loadingState === "error") {
    // If errorMessage is empty, this is a session-expired or access-denied error
    // already surfaced by the app-level banner. The user will be redirected on
    // re-auth, so don't show a Retry button — just render a disabled selector.
    if (!errorMessage) {
      return (
        <FormField label={agentLabel}>
          <Select
            selectedOption={null}
            onChange={() => {}}
            options={[]}
            placeholder="Select an agent"
            disabled
          />
        </FormField>
      );
    }

    // Unknown error — show inline message + retry
    return (
      <FormField label={agentLabel}>
        <SpaceBetween size="xs" direction="vertical">
          <StatusIndicator type="error">{errorMessage}</StatusIndicator>
          <Button onClick={fetchAgents}>Retry</Button>
        </SpaceBetween>
      </FormField>
    );
  }

  // Empty state
  if (loadingState === "empty") {
    return (
      <FormField label={agentLabel}>
        <StatusIndicator type="info">
          No customer-facing agents found for this assistant
        </StatusIndicator>
      </FormField>
    );
  }

  // Build options for the Select dropdown
  const options: SelectProps.Option[] = agents.map((agent) => ({
    label: formatAgentLabel(agent),
    value: agent.agentId,
  }));

  const selectedOption: SelectProps.Option | null = selectedAgent
    ? { label: formatAgentLabel(selectedAgent), value: selectedAgent.agentId }
    : null;

  return (
    <FormField label={agentLabel}>
      <Select
        selectedOption={selectedOption}
        onChange={handleChange}
        options={options}
        placeholder="Select an agent"
        loadingText="Loading agents..."
        statusType={loadingState === "loading" ? "loading" : "finished"}
        empty="No agents available"
      />
    </FormField>
  );
}
