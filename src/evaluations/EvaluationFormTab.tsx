// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import CodeTextarea, { type StatusBarState } from "../components/CodeTextarea";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EvalFormState =
  | { status: "generating" }
  | { status: "preview"; json: string; validationError: string | null }
  | { status: "refining" }
  | { status: "success"; formId: string }
  | { status: "error"; error: string; json?: string };

export interface EvaluationFormTabProps {
  state: EvalFormState;
  onJsonChange: (json: string) => void;
  onRefine: (instruction: string) => void;
  onRegenerate: () => void;
  onDeploy: () => void;
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EvaluationFormTab({
  state,
  onJsonChange,
  onRefine,
  onRegenerate,
  onDeploy,
  onDismiss,
}: EvaluationFormTabProps) {
  const [refinementInput, setRefinementInput] = useState("");

  const handleSendRefine = useCallback(() => {
    const instruction = refinementInput.trim();
    if (!instruction) return;
    onRefine(instruction);
    setRefinementInput("");
  }, [refinementInput, onRefine]);

  const handleKeyDown = useCallback(
    (event: CustomEvent<{ key: string }>) => {
      if (event.detail.key === "Enter") {
        handleSendRefine();
      }
    },
    [handleSendRefine],
  );

  // ─── Generating State ────────────────────────────────────────────────────

  if (state.status === "generating") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", padding: "48px 24px" }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary">
          Generating evaluation form...
        </Box>
      </div>
    );
  }

  // ─── Success State ───────────────────────────────────────────────────────

  if (state.status === "success") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", padding: "48px 24px" }}>
        <StatusIndicator type="success">
          Evaluation form deployed successfully
        </StatusIndicator>
        <Box variant="p" color="text-body-secondary">
          Form ID: <Box variant="code">{state.formId}</Box>
        </Box>
        <Button onClick={onDismiss}>Dismiss</Button>
      </div>
    );
  }

  // ─── Error State ─────────────────────────────────────────────────────────

  if (state.status === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px", gap: "16px" }}>
        <StatusIndicator type="error">{state.error}</StatusIndicator>

        {state.json && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeTextarea
              value={state.json}
              onChange={onJsonChange}
              ariaLabel="Evaluation form JSON"
              rows={16}
              status={{ type: "error", message: state.error }}
            />
          </div>
        )}

        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onRegenerate}>Regenerate</Button>
          <Button onClick={onDismiss}>Dismiss</Button>
        </SpaceBetween>
      </div>
    );
  }

  // ─── Preview State ───────────────────────────────────────────────────────

  if (state.status === "preview") {
    const isValid = state.validationError === null;
    const statusBar: StatusBarState = isValid
      ? { type: "success", message: "Valid" }
      : { type: "error", message: `Invalid: ${state.validationError}` };

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px", gap: "12px" }}>
        {/* Editor */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CodeTextarea
            value={state.json}
            onChange={onJsonChange}
            ariaLabel="Evaluation form JSON"
            rows={16}
            status={statusBar}
          />
        </div>

        {/* Refinement input bar */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <Input
              value={refinementInput}
              onChange={({ detail }) => setRefinementInput(detail.value)}
              onKeyDown={handleKeyDown as never}
              placeholder="Refine: e.g. 'Add a question about data verification'"
              ariaLabel="Refinement instruction"
            />
          </div>
          <Button
            onClick={handleSendRefine}
            disabled={!refinementInput.trim()}
          >
            Send
          </Button>
          <Button
            variant="primary"
            onClick={onDeploy}
            disabled={!isValid}
          >
            Deploy
          </Button>
        </div>
      </div>
    );
  }

  // ─── Refining State ──────────────────────────────────────────────────────

  if (state.status === "refining") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px", gap: "12px" }}>
        {/* Editor area with spinner overlay */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <CodeTextarea
            value=""
            readOnly
            disabled
            ariaLabel="Evaluation form JSON"
            rows={16}
            status={{ type: "idle" }}
          />
          {/* Spinner overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255, 255, 255, 0.7)",
              borderRadius: "6px",
            }}
          >
            <SpaceBetween direction="vertical" size="xs" alignItems="center">
              <Spinner size="large" />
              <Box variant="p" color="text-body-secondary">
                Refining evaluation form...
              </Box>
            </SpaceBetween>
          </div>
        </div>

        {/* Disabled refinement input bar */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <Input
              value={refinementInput}
              onChange={() => {}}
              placeholder="Refine: e.g. 'Add a question about data verification'"
              ariaLabel="Refinement instruction"
              disabled
            />
          </div>
          <Button disabled>Send</Button>
          <Button variant="primary" disabled>
            Deploy
          </Button>
        </div>
      </div>
    );
  }

  // Exhaustive check — should never reach here
  return null;
}
