// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

export type DeployModalState =
  | { status: "confirming" }
  | { status: "creating" }
  | { status: "activating"; formId: string }
  | { status: "success"; formId: string }
  | { status: "error"; step: "create" | "activate"; error: string; formId?: string };

export interface DeployFormModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  state: DeployModalState;
  formTitle: string;
  sectionCount: number;
  questionCount: number;
}

export default function DeployFormModal({
  visible,
  onDismiss,
  onConfirm,
  onRetry,
  state,
  formTitle,
  sectionCount,
  questionCount,
}: DeployFormModalProps) {
  const isInProgress = state.status === "creating" || state.status === "activating";

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Deploy evaluation form"
      footer={<ModalFooter state={state} onDismiss={onDismiss} onConfirm={onConfirm} onRetry={onRetry} isInProgress={isInProgress} />}
    >
      <SpaceBetween size="l">
        <FormSummary formTitle={formTitle} sectionCount={sectionCount} questionCount={questionCount} />
        {state.status !== "confirming" && <ProgressSteps state={state} />}
      </SpaceBetween>
    </Modal>
  );
}

function FormSummary({
  formTitle,
  sectionCount,
  questionCount,
}: {
  formTitle: string;
  sectionCount: number;
  questionCount: number;
}) {
  return (
    <ColumnLayout columns={3} variant="text-grid">
      <div>
        <Box variant="awsui-key-label">Form title</Box>
        <div>{formTitle}</div>
      </div>
      <div>
        <Box variant="awsui-key-label">Sections</Box>
        <div>{sectionCount}</div>
      </div>
      <div>
        <Box variant="awsui-key-label">Questions</Box>
        <div>{questionCount}</div>
      </div>
    </ColumnLayout>
  );
}

function ProgressSteps({ state }: { state: DeployModalState }) {
  return (
    <SpaceBetween size="s">
      <Step1Indicator state={state} />
      <Step2Indicator state={state} />
      {state.status === "success" && (
        <Box variant="p" color="text-status-success">
          Evaluation form <strong>{state.formId}</strong> deployed successfully.
        </Box>
      )}
    </SpaceBetween>
  );
}

function Step1Indicator({ state }: { state: DeployModalState }) {
  if (state.status === "creating") {
    return <StatusIndicator type="loading">Creating form...</StatusIndicator>;
  }
  if (state.status === "activating" || state.status === "success") {
    return <StatusIndicator type="success">Form created</StatusIndicator>;
  }
  if (state.status === "error" && state.step === "create") {
    return <StatusIndicator type="error">{state.error}</StatusIndicator>;
  }
  if (state.status === "error" && state.step === "activate") {
    return <StatusIndicator type="success">Form created</StatusIndicator>;
  }
  return null;
}

function Step2Indicator({ state }: { state: DeployModalState }) {
  if (state.status === "activating") {
    return <StatusIndicator type="loading">Activating form...</StatusIndicator>;
  }
  if (state.status === "success") {
    return <StatusIndicator type="success">Form activated</StatusIndicator>;
  }
  if (state.status === "error" && state.step === "activate") {
    return <StatusIndicator type="error">{state.error}</StatusIndicator>;
  }
  return null;
}

function ModalFooter({
  state,
  onDismiss,
  onConfirm,
  onRetry,
  isInProgress,
}: {
  state: DeployModalState;
  onDismiss: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  isInProgress: boolean;
}) {
  if (state.status === "success") {
    return (
      <Box float="right">
        <Button variant="primary" onClick={onDismiss}>
          Close
        </Button>
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Box float="right">
        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={onDismiss}>
            Close
          </Button>
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        </SpaceBetween>
      </Box>
    );
  }

  return (
    <Box float="right">
      <SpaceBetween direction="horizontal" size="xs">
        <Button variant="link" onClick={onDismiss} disabled={isInProgress}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={isInProgress} loading={isInProgress}>
          Confirm
        </Button>
      </SpaceBetween>
    </Box>
  );
}
