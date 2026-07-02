// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import { useCredentials } from "../credentials/CredentialsContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import {
  PERMISSION_GROUPS,
  type PermissionStatus,
} from "./permissions-registry";
import {
  checkPermissions,
  resolveConnectBucket,
  type ProbeContext,
  type ProbeResult,
} from "./permissions-checker";

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckState = "idle" | "checking" | "done";

interface GroupResult {
  results: Map<string, ProbeResult>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusToIndicator(status: PermissionStatus): React.ReactNode {
  switch (status) {
    case "granted":
      return <StatusIndicator type="success">Granted</StatusIndicator>;
    case "denied":
      return <StatusIndicator type="error">Denied</StatusIndicator>;
    case "not-verifiable":
      return <StatusIndicator type="info">Cannot verify</StatusIndicator>;
    case "unknown":
      return <StatusIndicator type="warning">Unknown</StatusIndicator>;
    case "pending":
      return <Spinner size="normal" />;
    default:
      return <StatusIndicator type="stopped">Not checked</StatusIndicator>;
  }
}

function groupSummary(
  group: typeof PERMISSION_GROUPS[number],
  results: Map<string, ProbeResult>
): React.ReactNode {
  if (results.size === 0) {
    return <StatusIndicator type="stopped">Not checked</StatusIndicator>;
  }

  const all = group.permissions;
  const denied = all.filter((p) => results.get(p.action)?.status === "denied");
  const unknown = all.filter((p) => results.get(p.action)?.status === "unknown");
  const granted = all.filter((p) => results.get(p.action)?.status === "granted");

  if (denied.length > 0) {
    return <StatusIndicator type="error">{denied.length} denied</StatusIndicator>;
  }
  if (unknown.length > 0) {
    return <StatusIndicator type="warning">{unknown.length} unknown</StatusIndicator>;
  }
  if (granted.length === all.length) {
    return <StatusIndicator type="success">All granted</StatusIndicator>;
  }
  return <StatusIndicator type="stopped">Partial</StatusIndicator>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const { credentials, accountId, roleName } = useCredentials();
  const { instance, assistant, region } = useWorkspace();

  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [simulationAvailable, setSimulationAvailable] = useState<boolean | null>(null);
  const [groupResults, setGroupResults] = useState<Map<string, GroupResult>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const isChecking = checkState === "checking";

  const runChecks = useCallback(async () => {
    if (!credentials || !region || !instance) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCheckState("checking");
    setSimulationAvailable(null);
    setGroupResults(new Map());

    // Build the instance ARN for resource-scoped simulation
    const instanceArn = instance.arn ||
      `arn:aws:connect:${region}:${accountId}:instance/${instance.instanceId}`;

    const ctx: ProbeContext = {
      credentials,
      region,
      instanceId: instance.instanceId,
      assistantId: assistant?.assistantId,
      accountId: accountId ?? undefined,
      roleName: roleName ?? undefined,
    };

    // Collect all actions across all groups in one flat batch
    const allActions = PERMISSION_GROUPS.flatMap((g) =>
      g.permissions.map((p) => p.action)
    );

    // Split actions by resource scope. SimulatePrincipalPolicy requires actions
    // with different authorization models to be in separate calls.
    const connectActions: string[] = [];
    const participantActions: string[] = [];
    const wisdomActions: string[] = [];
    const s3Actions: string[] = [];
    const globalActions: string[] = [];

    for (const action of allActions) {
      if (action.startsWith("connect-participant:")) {
        participantActions.push(action);
      } else if (action === "connect:ListInstances") {
        globalActions.push(action);
      } else if (action.startsWith("connect:")) {
        connectActions.push(action);
      } else if (action.startsWith("wisdom:")) {
        wisdomActions.push(action);
      } else if (action.startsWith("s3:")) {
        s3Actions.push(action);
      } else {
        globalActions.push(action);
      }
    }

    // Resolve the Connect recording bucket for the selected instance so we can
    // simulate s3:GetObject / s3:ListBucket against the specific bucket ARN.
    let s3Resources = ["*"];
    if (s3Actions.length > 0) {
      const bucket = await resolveConnectBucket(
        credentials,
        region,
        instance.instanceId,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (bucket) {
        s3Resources = [
          `arn:aws:s3:::${bucket}`,           // for s3:ListBucket
          `arn:aws:s3:::${bucket}/*`,          // for s3:GetObject
        ];
      }
    }

    const batches: { actions: string[]; resources: string[] }[] = [
      { actions: connectActions, resources: [`${instanceArn}/*`] },
      { actions: participantActions, resources: ["*"] },
      { actions: wisdomActions, resources: ["*"] },
      { actions: s3Actions, resources: s3Resources },
      { actions: globalActions, resources: ["*"] },
    ];

    const allResults: ProbeResult[] = [];

    for (const batch of batches) {
      if (batch.actions.length === 0) continue;

      let batchResult = await checkPermissions(batch.actions, ctx, controller.signal, batch.resources);
      if (controller.signal.aborted) return;

      if (!batchResult.simulationAvailable) {
        // Fallback: retry with "*" in case the specific ARN isn't accepted
        console.warn("[Permissions] Scoped simulation failed for", batch.actions[0], "— falling back to wildcard");
        batchResult = await checkPermissions(batch.actions, ctx, controller.signal, ["*"]);
        if (controller.signal.aborted) return;
        if (!batchResult.simulationAvailable) {
          setSimulationAvailable(false);
          setCheckState("done");
          return;
        }
      }

      allResults.push(...batchResult.results);
    }

    setSimulationAvailable(true);

    // Map results back to groups
    const resultByAction = new Map<string, ProbeResult>();
    for (const r of allResults) {
      resultByAction.set(r.action, r);
    }

    const newGroupResults = new Map<string, GroupResult>();
    for (const group of PERMISSION_GROUPS) {
      const groupMap = new Map<string, ProbeResult>();
      for (const perm of group.permissions) {
        const r = resultByAction.get(perm.action);
        if (r) groupMap.set(perm.action, r);
      }
      newGroupResults.set(group.id, { results: groupMap });
    }
    setGroupResults(newGroupResults);
    setCheckState("done");
  }, [credentials, region, instance, assistant, accountId, roleName]);

  useEffect(() => {
    void runChecks();
    return () => { abortRef.current?.abort(); };
  }, [runChecks]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Verify that your AWS role has the permissions required by each feature area."
          actions={
            <Button
              variant="primary"
              loading={isChecking}
              disabled={!instance}
              onClick={runChecks}
              iconName="refresh"
            >
              Re-check
            </Button>
          }
        >
          Permissions
        </Header>
      }
    >
      <SpaceBetween size="l">

        {/* No instance selected */}
        {!instance && (
          <Alert type="info">
            Select a Connect instance from the top navigation to check permissions against it.
          </Alert>
        )}

        {/* Simulation unavailable banner */}
        {checkState === "done" && simulationAvailable === false && (
          <Alert type="warning" header="Cannot verify permissions">
            Your role is missing{" "}
            <Box variant="code" display="inline" fontSize="body-s">
              iam:SimulatePrincipalPolicy
            </Box>
            , which this page uses to check permissions without making real API calls.
            This does not mean you lack the permissions to use the application — we
            simply cannot confirm it. Add{" "}
            <Box variant="code" display="inline" fontSize="body-s">
              iam:SimulatePrincipalPolicy
            </Box>{" "}
            to your role to enable full verification.
          </Alert>
        )}

        {/* Checking spinner */}
        {isChecking && (
          <Box textAlign="center" padding={{ top: "l" }}>
            <Spinner size="large" />
            <Box variant="p" color="text-body-secondary" padding={{ top: "s" }}>
              Checking permissions…
            </Box>
          </Box>
        )}

        {/* Permission groups — only shown when simulation succeeded */}
        {checkState === "done" && simulationAvailable === true &&
          PERMISSION_GROUPS.map((group) => {
            const state = groupResults.get(group.id);
            const results = state?.results ?? new Map<string, ProbeResult>();

            return (
              <Container
                key={group.id}
                header={
                  <Header
                    variant="h2"
                    description={group.description}
                    counter={`(${group.permissions.length})`}
                    info={groupSummary(group, results)}
                  >
                    {group.name}
                  </Header>
                }
              >
                <ExpandableSection
                  headerText="Permission details"
                  defaultExpanded={
                    [...results.values()].some((r) => r.status === "denied")
                  }
                >
                  <ColumnLayout columns={1}>
                    <SpaceBetween size="xs">
                      {group.permissions.map((perm) => {
                        const result = results.get(perm.action);
                        const permStatus: PermissionStatus = result?.status ?? "unknown";

                        return (
                          <div
                            key={perm.action}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 0",
                              borderBottom: "1px solid var(--color-border-divider-default)",
                            }}
                          >
                            <div>
                              <div>
                                <Box variant="code" fontSize="body-s">
                                  {perm.action}
                                </Box>
                              </div>
                              <Box
                                variant="small"
                                color="text-body-secondary"
                                margin={{ top: "xxxs" }}
                              >
                                {perm.description}
                              </Box>
                            </div>
                            <div style={{ flexShrink: 0, marginLeft: "16px" }}>
                              {statusToIndicator(permStatus)}
                            </div>
                          </div>
                        );
                      })}
                    </SpaceBetween>
                  </ColumnLayout>
                </ExpandableSection>
              </Container>
            );
          })
        }
      </SpaceBetween>
    </ContentLayout>
  );
}
