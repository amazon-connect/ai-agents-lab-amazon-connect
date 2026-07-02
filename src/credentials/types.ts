// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export type CredentialWorkflowState = "pending" | "loading" | "restoring" | "ready" | "error";

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: number; // Unix timestamp in milliseconds
}

export interface AccountInfo {
  accountId: string;
  accountName: string;
}

export interface RoleInfo {
  roleName: string;
}

export interface CredentialsContextValue {
  state: CredentialWorkflowState;
  credentials: AWSCredentials | null;
  accountId: string | null;
  roleName: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  reset: () => void;
}
