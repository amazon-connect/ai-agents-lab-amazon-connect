// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Permission checking via IAM SimulatePrincipalPolicy.
 *
 * Strategy:
 * 1. Call STS GetCallerIdentity to resolve the actual IAM role ARN
 *    (handles SSO roles with paths like aws-reserved/sso.amazonaws.com/...)
 * 2. Call SimulatePrincipalPolicy with the resolved role ARN to check all permissions
 * 3. If the simulation call itself succeeds, iam:SimulatePrincipalPolicy is implicitly granted
 * 4. If the user lacks iam:SimulatePrincipalPolicy, all permissions are "not-verifiable"
 */

import {
  IAMClient,
  SimulatePrincipalPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  STSClient,
  GetCallerIdentityCommand,
} from "@aws-sdk/client-sts";
import {
  ConnectClient,
  ListInstanceStorageConfigsCommand,
} from "@aws-sdk/client-connect";
import type { AWSCredentials } from "../credentials/types";
import type { PermissionStatus } from "./permissions-registry";

export interface ProbeContext {
  credentials: AWSCredentials;
  region: string;
  instanceId?: string;
  assistantId?: string;
  accountId?: string;
  roleName?: string;
}

export interface ProbeResult {
  action: string;
  status: PermissionStatus;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determines if an error is an access denied / unauthorized error.
 */
function isAccessDenied(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name ?? "";
  const message = err.message ?? "";
  return (
    name === "AccessDeniedException" ||
    name === "UnauthorizedAccessException" ||
    name === "ForbiddenException" ||
    name === "AccessDenied" ||
    name.includes("AccessDenied") ||
    message.includes("Access Denied") ||
    message.includes("is not authorized to perform") ||
    message.includes("AccessDeniedException")
  );
}

/**
 * Extract the IAM role ARN from an assumed-role ARN.
 *
 * STS GetCallerIdentity returns ARNs like:
 *   arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Admin_abc123/user@example.com
 *
 * We need to convert this to the IAM role ARN:
 *   arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/us-east-1/AWSReservedSSO_Admin_abc123
 *
 * However, SimulatePrincipalPolicy also accepts the assumed-role format directly
 * for roles. Actually — it doesn't. It needs the role ARN.
 *
 * For SSO roles, the path is unpredictable. Instead, we extract just the role name
 * from the assumed-role ARN and try the simple path first.
 *
 * Format: arn:aws:sts::<account>:assumed-role/<role-name>/<session-name>
 * → arn:aws:iam::<account>:role/<role-name>
 */
function assumedRoleArnToRoleArn(assumedRoleArn: string): string | null {
  // Match: arn:aws:sts::<account>:assumed-role/<role-name>/<session>
  const match = assumedRoleArn.match(
    /^arn:aws:sts::(\d+):assumed-role\/([^/]+)\/.+$/
  );
  if (!match) return null;
  const accountId = match[1];
  const roleName = match[2];
  return `arn:aws:iam::${accountId}:role/${roleName}`;
}

/**
 * Resolve the IAM role ARN for the current credentials using STS GetCallerIdentity.
 */
async function resolveRoleArn(
  credentials: AWSCredentials,
  signal?: AbortSignal
): Promise<string | null> {
  const stsClient = new STSClient({
    // STS GetCallerIdentity is a global operation; us-east-1 is the canonical endpoint
    region: "us-east-1",
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  try {
    const response = await stsClient.send(
      new GetCallerIdentityCommand({}),
      { abortSignal: signal }
    );
    const arn = response.Arn ?? "";
    // Convert assumed-role ARN to role ARN
    return assumedRoleArnToRoleArn(arn) ?? arn;
  } catch {
    return null;
  }
}

export interface CheckPermissionsResult {
  /** Whether iam:SimulatePrincipalPolicy was available. If false, results are empty. */
  simulationAvailable: boolean;
  results: ProbeResult[];
}

// ─── Bucket resolver ─────────────────────────────────────────────────────────

/**
 * Resolves the S3 bucket used by the Connect instance for call recordings /
 * Contact Lens analysis output. Returns null if the instance has no S3 storage
 * config or if the call fails.
 */
export async function resolveConnectBucket(
  credentials: AWSCredentials,
  region: string,
  instanceId: string,
  signal?: AbortSignal
): Promise<string | null> {
  const client = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
  try {
    const response = await client.send(
      new ListInstanceStorageConfigsCommand({
        InstanceId: instanceId,
        ResourceType: "CALL_RECORDINGS",
      }),
      { abortSignal: signal }
    );
    return response.StorageConfigs
      ?.map((c) => c.S3Config?.BucketName)
      .find((b): b is string => !!b) ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check all permissions using IAM SimulatePrincipalPolicy.
 *
 * 1. Resolves the actual role ARN via STS GetCallerIdentity
 * 2. Sends all actions to SimulatePrincipalPolicy in batches of 50
 * 3. Returns simulationAvailable=false if the call is denied, so the caller
 *    can show a targeted "missing iam:SimulatePrincipalPolicy" message
 *
 * Returns results in the same order as the input actions.
 */
export async function checkPermissions(
  actions: string[],
  ctx: ProbeContext,
  signal?: AbortSignal,
  resourceArns?: string[]
): Promise<CheckPermissionsResult> {
  const notAvailable: CheckPermissionsResult = {
    simulationAvailable: false,
    results: [],
  };

  // Resolve the actual role ARN
  const roleArn = await resolveRoleArn(ctx.credentials, signal);
  if (!roleArn) return notAvailable;

  const client = new IAMClient({
    // IAM is a global service; us-east-1 is the canonical endpoint
    region: "us-east-1",
    credentials: {
      accessKeyId: ctx.credentials.accessKeyId,
      secretAccessKey: ctx.credentials.secretAccessKey,
      sessionToken: ctx.credentials.sessionToken,
    },
  });

  try {
    const BATCH_SIZE = 50;
    const resultMap = new Map<string, ProbeResult>();

    for (let i = 0; i < actions.length; i += BATCH_SIZE) {
      if (signal?.aborted) {
        return notAvailable;
      }

      const batch = actions.slice(i, i + BATCH_SIZE);

      // Use provided resourceArns or default to ["*"]
      const batchResources = resourceArns ?? ["*"];

      const response = await client.send(
        new SimulatePrincipalPolicyCommand({
          PolicySourceArn: roleArn,
          ActionNames: batch,
          ResourceArns: batchResources,
        }),
        { abortSignal: signal }
      );

      for (const evalResult of response.EvaluationResults ?? []) {
        const action = evalResult.EvalActionName ?? "";
        const decision = evalResult.EvalDecision ?? "";

        if (decision === "allowed") {
          resultMap.set(action, { action, status: "granted" });
        } else {
          resultMap.set(action, {
            action,
            status: "denied",
            error: `Policy evaluation: ${decision}`,
          });
        }
      }
    }

    return {
      simulationAvailable: true,
      results: actions.map((action) =>
        resultMap.get(action) ?? { action, status: "unknown" as PermissionStatus, error: "No evaluation result" }
      ),
    };
  } catch (err: unknown) {
    console.error("[PermissionsChecker] SimulatePrincipalPolicy failed:", err);
    if (isAccessDenied(err)) {
      return notAvailable;
    }
    // Other unexpected error — treat as unavailable
    return notAvailable;
  }
}
