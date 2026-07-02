// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AWSCredentials } from "../credentials/types";

/**
 * Workflow state machine for workspace discovery.
 * Transitions: pending → loading-instances → selecting → ready | error
 */
export type WorkspaceWorkflowState =
  | "pending"
  | "loading-instances"
  | "selecting"
  | "ready"
  | "error";

/**
 * Represents a Connect instance discovered via ListInstances,
 * annotated with the region it was found in.
 */
export interface InstanceSummary {
  instanceId: string;
  instanceAlias: string;
  arn: string;
  instanceStatus: string;
  region: string;
}

/**
 * Represents a Amazon Connect AI Agents assistant returned by ListAssistants.
 */
export interface AssistantSummary {
  assistantId: string;
  name: string;
  type: string;
  status: string;
  assistantArn: string;
}

/**
 * Persisted workspace selection stored in sessionStorage.
 */
export interface StoredWorkspace {
  instanceId: string;
  instanceAlias: string;
  assistantId: string;
  assistantName: string;
  region: string;
}

/**
 * Flashbar notification used to communicate partial failures
 * and error states via Cloudscape Flashbar.
 */
export interface FlashbarMessage {
  id: string;
  type: "info" | "warning" | "error";
  content: string;
  dismissible: boolean;
  onDismiss?: () => void;
}

/**
 * Context value exposed by WorkspaceProvider to downstream consumers.
 */
export interface WorkspaceContextValue {
  state: WorkspaceWorkflowState;
  instance: InstanceSummary | null;
  assistant: AssistantSummary | null;
  region: string | null;
  error: string | null;
  instances: InstanceSummary[];
  assistants: AssistantSummary[];
  instancesLoading: boolean;
  assistantsLoading: boolean;
  selectInstance: (instance: InstanceSummary) => void;
  selectAssistant: (assistant: AssistantSummary) => void;
  reset: () => void;
}

/**
 * Options for the multi-region instance discovery function.
 */
export interface DiscoverInstancesOptions {
  credentials: AWSCredentials;
  signal?: AbortSignal;
  onRegionComplete?: (region: string, instances: InstanceSummary[]) => void;
  onRegionError?: (region: string, error: Error) => void;
}

/**
 * Options for listing assistants in a specific region.
 */
export interface ListAssistantsOptions {
  credentials: AWSCredentials;
  region: string;
  signal?: AbortSignal;
}

/**
 * Configuration for exponential backoff retry logic.
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  retryableErrors: string[];
}
