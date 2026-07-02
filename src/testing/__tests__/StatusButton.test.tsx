// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatusButton from "../StatusButton";
import type { SetupState } from "../../test-harness/setup-manager";

function makeSetupState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    status: "idle",
    currentStep: null,
    completedSteps: [],
    error: null,
    infrastructure: null,
    ...overrides,
  };
}

describe("StatusButton", () => {
  it("renders disabled button with loading spinner when detecting", () => {
    const onClick = vi.fn();
    render(
      <StatusButton setupState={makeSetupState({ status: "detecting" })} onClick={onClick} />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Checking infrastructure...");
    expect(button).toBeDisabled();
  });

  it("renders clickable button when setup-required", () => {
    const onClick = vi.fn();
    render(
      <StatusButton setupState={makeSetupState({ status: "setup-required" })} onClick={onClick} />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Setup Instance for Testing");
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders clickable button when error", () => {
    const onClick = vi.fn();
    render(
      <StatusButton
        setupState={makeSetupState({
          status: "error",
          error: { step: "detection", message: "Access denied", isPermissionError: true },
        })}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Setup Instance for Testing");
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled button with loading spinner when provisioning", () => {
    const onClick = vi.fn();
    render(
      <StatusButton
        setupState={makeSetupState({ status: "provisioning", currentStep: "create-bot" })}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Provisioning...");
    expect(button).toBeDisabled();
  });

  it("renders Ready for Testing with green checkmark when ready", () => {
    const onClick = vi.fn();
    render(
      <StatusButton
        setupState={makeSetupState({
          status: "ready",
          infrastructure: {
            botId: "bot-123",
            botAliasArn: "arn:aws:lex:us-east-1:123456789:bot-alias/bot-123/alias-456",
            contactFlowId: "flow-789",
          },
        })}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Ready for Testing");
  });

  it("Ready for Testing button is disabled (not clickable)", () => {
    const onClick = vi.fn();
    render(
      <StatusButton
        setupState={makeSetupState({
          status: "ready",
          infrastructure: {
            botId: "bot-123",
            botAliasArn: "arn:aws:lex:us-east-1:123456789:bot-alias/bot-123/alias-456",
            contactFlowId: "flow-789",
          },
        })}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when detecting (disabled)", () => {
    const onClick = vi.fn();
    render(
      <StatusButton setupState={makeSetupState({ status: "detecting" })} onClick={onClick} />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when provisioning (disabled)", () => {
    const onClick = vi.fn();
    render(
      <StatusButton
        setupState={makeSetupState({ status: "provisioning", currentStep: "create-locale" })}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
