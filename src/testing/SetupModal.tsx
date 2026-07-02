// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Alert from "@cloudscape-design/components/alert";

import type { SetupState, ProvisioningStep } from "../test-harness/setup-manager";
import { generateBotName } from "../test-harness/setup-manager";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SetupModalMode = "provisioning" | "read-only";

export interface SetupModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Dismiss handler */
  onDismiss: () => void;
  /** Current mode: provisioning (with checklist) or read-only (infrastructure status) */
  mode: SetupModalMode;
  /** Current setup state from the SetupManager */
  setupState: SetupState;
  /** Callback to trigger provisioning */
  onStartProvisioning: () => void;
  /** Callback to retry from the failed step */
  onRetry: () => void;
  /** Instance ID used to derive bot name in read-only mode */
  instanceId?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROVISIONING_STEPS: { step: ProvisioningStep; label: string }[] = [
  { step: "create-bot", label: "Creating bot" },
  { step: "create-locale", label: "Creating locale" },
  { step: "create-intent", label: "Creating intent" },
  { step: "build-locale", label: "Building locale" },
  { step: "create-version", label: "Creating version" },
  { step: "create-alias", label: "Creating alias" },
  { step: "tag-bot", label: "Tagging bot" },
  { step: "associate-bot", label: "Associating with Connect" },
  { step: "create-flow", label: "Creating contact flow" },
];

const TOTAL_STEPS = PROVISIONING_STEPS.length;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStepLabel(step: ProvisioningStep | null): string {
  if (!step) return "Preparing...";
  const found = PROVISIONING_STEPS.find((s) => s.step === step);
  return found?.label ?? "Processing...";
}

function isProvisioningComplete(setupState: SetupState): boolean {
  return PROVISIONING_STEPS.every(({ step }) =>
    setupState.completedSteps.includes(step)
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProvisioningProgress({
  setupState,
  onRetry,
}: {
  setupState: SetupState;
  onRetry: () => void;
}) {
  const allComplete = isProvisioningComplete(setupState);
  const hasError = setupState.error !== null;

  // Calculate progress percentage
  const completedCount = setupState.completedSteps.length;
  const percentage = allComplete
    ? 100
    : Math.round((completedCount / TOTAL_STEPS) * 100);

  // Current step label
  const currentLabel = allComplete
    ? "Setup complete"
    : hasError
      ? `Failed: ${getStepLabel(setupState.currentStep)}`
      : getStepLabel(setupState.currentStep);

  return (
    <SpaceBetween size="l">
      <ProgressBar
        value={percentage}
        label="Infrastructure provisioning"
        description={currentLabel}
        status={allComplete ? "success" : hasError ? "error" : "in-progress"}
        resultText={allComplete ? "All resources provisioned successfully" : undefined}
      />

      {hasError && setupState.error && (
        <Alert
          type="error"
          header={`Failed at: ${getStepLabel(setupState.error.step === "detection" ? null : setupState.error.step as ProvisioningStep)}`}
          action={<Button onClick={onRetry}>Retry</Button>}
        >
          {setupState.error.message}
        </Alert>
      )}
    </SpaceBetween>
  );
}

function ReadOnlyContent({
  setupState,
  instanceId,
}: {
  setupState: SetupState;
  instanceId?: string;
}) {
  const { infrastructure } = setupState;

  if (!infrastructure) {
    return (
      <Box variant="p" color="text-body-secondary">
        No infrastructure information available.
      </Box>
    );
  }

  const botName = instanceId ? generateBotName(instanceId) : "Unknown";

  return (
    <SpaceBetween size="m">
      <SpaceBetween size="xs">
        <Box variant="awsui-key-label">Bot name</Box>
        <Box variant="code">{botName}</Box>
      </SpaceBetween>
      <SpaceBetween size="xs">
        <Box variant="awsui-key-label">Bot alias ARN</Box>
        <Box variant="code">{infrastructure.botAliasArn}</Box>
      </SpaceBetween>
      <SpaceBetween size="xs">
        <Box variant="awsui-key-label">Contact flow ID</Box>
        <Box variant="code">{infrastructure.contactFlowId}</Box>
      </SpaceBetween>
    </SpaceBetween>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SetupModal({
  visible,
  onDismiss,
  mode,
  setupState,
  onStartProvisioning,
  onRetry,
  instanceId,
}: SetupModalProps) {
  const isProvisioning = mode === "provisioning";
  const allComplete = isProvisioningComplete(setupState);
  const isIdle = setupState.status === "idle" || setupState.status === "setup-required";

  const header = isProvisioning
    ? "Infrastructure Setup"
    : "Infrastructure Status";

  const footer = isProvisioning ? (
    <Box float="right">
      <SpaceBetween direction="horizontal" size="xs">
        {isIdle && (
          <Button variant="primary" onClick={onStartProvisioning}>
            Start Setup
          </Button>
        )}
        {allComplete && (
          <Button variant="primary" onClick={onDismiss}>
            Close
          </Button>
        )}
      </SpaceBetween>
    </Box>
  ) : (
    <Box float="right">
      <Button variant="primary" onClick={onDismiss}>
        Close
      </Button>
    </Box>
  );

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={header}
      footer={footer}
      size="medium"
    >
      {isProvisioning ? (
        <ProvisioningProgress setupState={setupState} onRetry={onRetry} />
      ) : (
        <ReadOnlyContent setupState={setupState} instanceId={instanceId} />
      )}
    </Modal>
  );
}
