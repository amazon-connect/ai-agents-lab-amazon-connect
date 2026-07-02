// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import type { SetupState } from "../test-harness/setup-manager";

export interface StatusButtonProps {
  /** Current setup state from the SetupManager */
  setupState: SetupState;
  /** Callback when the button is clicked */
  onClick: () => void;
}

/**
 * Persistent status button displayed on the Testing Page regardless of infrastructure state.
 * Provides the entry point to the Setup Modal.
 */
export default function StatusButton({ setupState, onClick }: StatusButtonProps) {
  const { status } = setupState;

  if (status === "detecting") {
    return (
      <Button disabled={true} loading={true}>
        Checking infrastructure...
      </Button>
    );
  }

  if (status === "setup-required" || status === "error") {
    return (
      <Button onClick={onClick}>
        Setup Instance for Testing
      </Button>
    );
  }

  if (status === "provisioning") {
    return (
      <Button disabled={true} loading={true}>
        Provisioning...
      </Button>
    );
  }

  if (status === "ready") {
    return (
      <Button variant="inline-link" disabled={true}>
        <StatusIndicator type="success">Ready for Testing</StatusIndicator>
      </Button>
    );
  }

  // Fallback for 'idle' or any unexpected state
  return (
    <Button disabled={true}>
      Checking infrastructure...
    </Button>
  );
}
