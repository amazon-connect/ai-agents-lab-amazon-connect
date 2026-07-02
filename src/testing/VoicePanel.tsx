// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useRef, useCallback } from "react";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Modal from "@cloudscape-design/components/modal";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import type { AIAgent } from "../test-harness/agent-client";
import type { SetupState } from "../test-harness/setup-manager";
import type { AWSCredentials } from "../credentials/types";
import type { CallState, VoiceSession } from "../test-harness/voice-types";

import { startCall, endCall, formatCallDuration } from "../test-harness/voice-client";
import { createPTTController } from "../test-harness/ptt-controller";
import { useAppNotifications } from "../layouts/AppNotificationContext";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface VoicePanelProps {
  /** Currently selected agent */
  selectedAgent: AIAgent | null;
  /** Infrastructure setup state */
  setupState: SetupState;
  /** AWS credentials */
  credentials: AWSCredentials | null;
  /** AWS region */
  region: string;
  /** Connect instance ID */
  instanceId: string;
  /** Whether script mode is active (controlled by parent) */
  scriptMode: boolean;
  /** Callback to report when a call is active (disables script mode toggle) */
  onCallActiveChange?: (active: boolean) => void;
  /** Synthesis progress passed from parent during script execution */
  synthesisProgress?: { current: number; total: number } | null;
  /** Whether a voice script is currently running (managed by parent) */
  voiceScriptRunning?: boolean;
  /** Whether customer audio is currently being streamed (script mode) */
  voiceCustomerStreaming?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Voice testing panel component — a simple UI for call lifecycle and PTT.
 * Analogous to ChatPanel: renders connection status, call controls, PTT button,
 * and agent speaking indicator. Does NOT manage script execution.
 */
export default function VoicePanel({
  selectedAgent,
  setupState,
  credentials,
  region,
  instanceId,
  scriptMode,
  onCallActiveChange,
  synthesisProgress,
  voiceScriptRunning,
  voiceCustomerStreaming,
}: VoicePanelProps) {
  // ─── State ─────────────────────────────────────────────────────────────────

  const { reportError } = useAppNotifications();
  const [callState, setCallState] = useState<CallState>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [agentVolume, setAgentVolume] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Agent-switch confirmation modal
  const [showAgentSwitchModal, setShowAgentSwitchModal] = useState(false);
  const pendingAgentRef = useRef<AIAgent | null>(null);

  // Refs for session and cleanup
  const sessionRef = useRef<VoiceSession | null>(null);
  const pttCleanupRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pttButtonRef = useRef<HTMLDivElement>(null);
  const previousAgentRef = useRef<AIAgent | null>(selectedAgent);

  // ─── Derived State ─────────────────────────────────────────────────────────

  const isReady = setupState.status === "ready" && !!selectedAgent && !!credentials;
  const canStartCall = callState === "idle" && isReady;
  const canEndCall = callState === "in-call" || callState === "connecting";
  const isInCall = callState === "in-call";

  // ─── Report call active state to parent ────────────────────────────────────

  useEffect(() => {
    onCallActiveChange?.(isInCall);
  }, [isInCall, onCallActiveChange]);

  // ─── Agent Switch Detection ────────────────────────────────────────────────

  useEffect(() => {
    if (
      previousAgentRef.current &&
      selectedAgent &&
      previousAgentRef.current.agentId !== selectedAgent.agentId &&
      isInCall
    ) {
      pendingAgentRef.current = selectedAgent;
      setShowAgentSwitchModal(true);
    }
    previousAgentRef.current = selectedAgent;
  }, [selectedAgent, isInCall]);

  // ─── Call Duration Timer ───────────────────────────────────────────────────

  const isTimerActive = isInCall || (voiceScriptRunning && !synthesisProgress);

  useEffect(() => {
    if (isTimerActive) {
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isTimerActive]);

  // ─── PTT Controller ───────────────────────────────────────────────────────

  useEffect(() => {
    if (isInCall && !scriptMode) {
      const session = sessionRef.current;
      if (!session) return;

      const meetingSession = session.meetingSession as {
        audioVideo: {
          realtimeMuteLocalAudio: () => void;
          realtimeUnmuteLocalAudio: () => void;
        };
      };

      const cleanup = createPTTController({
        onActivate: () => {
          meetingSession.audioVideo.realtimeUnmuteLocalAudio();
          setIsTransmitting(true);
        },
        onDeactivate: () => {
          meetingSession.audioVideo.realtimeMuteLocalAudio();
          setIsTransmitting(false);
        },
        pttButtonElement: pttButtonRef.current,
      });

      pttCleanupRef.current = cleanup;

      return () => {
        cleanup();
        pttCleanupRef.current = null;
      };
    } else {
      if (pttCleanupRef.current) {
        pttCleanupRef.current();
        pttCleanupRef.current = null;
      }
    }
  }, [isInCall, scriptMode]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleStartCall = useCallback(async () => {
    if (!credentials || !selectedAgent || !setupState.infrastructure) return;

    setErrorMessage(null);

    try {
      const session = await startCall(
        {
          credentials,
          region,
          instanceId,
          contactFlowId: setupState.infrastructure.contactFlowId,
          agentArn: selectedAgent.arn,
        },
        {
          onStateChange: (state) => setCallState(state),
          onError: (error) => {
            setErrorMessage(error);
          },
          onVolumeChange: (_attendeeId, volume) => setAgentVolume(volume),
        }
      );

      sessionRef.current = session;
    } catch (err: unknown) {
      reportError(err);
    }
  }, [credentials, selectedAgent, setupState.infrastructure, region, instanceId, reportError]);

  const handleEndCall = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    try {
      await endCall(session);
    } catch {
      // Best-effort cleanup
    }

    sessionRef.current = null;
    setCallState("idle");
    setIsTransmitting(false);
    setAgentVolume(0);
  }, []);

  const handleAgentSwitchConfirm = useCallback(async () => {
    setShowAgentSwitchModal(false);
    await handleEndCall();
    pendingAgentRef.current = null;
  }, [handleEndCall]);

  const handleAgentSwitchDismiss = useCallback(() => {
    setShowAgentSwitchModal(false);
    pendingAgentRef.current = null;
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Container header={<Header variant="h3">Voice Testing</Header>}>
      {/* Color overrides for call buttons + waveform animation */}
      <style>{`
        .voice-btn-start button:not(:disabled),
        .voice-btn-start [role="button"]:not([aria-disabled="true"]) {
          background-color: #037f0c !important;
          border-color: #037f0c !important;
          color: #ffffff !important;
        }
        .voice-btn-start button:hover:not(:disabled),
        .voice-btn-start [role="button"]:hover:not(:disabled) {
          background-color: #025c09 !important;
          border-color: #025c09 !important;
        }
        .voice-btn-end button:not(:disabled),
        .voice-btn-end [role="button"]:not([aria-disabled="true"]) {
          background-color: #d91515 !important;
          border-color: #d91515 !important;
          color: #ffffff !important;
        }
        .voice-btn-end button:hover:not(:disabled),
        .voice-btn-end [role="button"]:hover:not(:disabled) {
          background-color: #b01010 !important;
          border-color: #b01010 !important;
        }
        .voice-waveform-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .voice-timer-area {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        .voice-waveform {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 32px;
        }
        .voice-bar {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 2px;
          background-color: #aab7b8;
          transition: height 0.2s ease, background-color 0.2s ease;
        }
        .voice-waveform-active .voice-bar {
          background-color: #0972d3;
          animation: voice-wave 0.8s ease-in-out infinite alternate;
        }
        .voice-waveform-customer .voice-bar {
          background-color: #037f0c;
          animation: voice-wave 0.8s ease-in-out infinite alternate;
        }
        @keyframes voice-wave {
          0% { height: 6px; }
          50% { height: 20px; }
          100% { height: 10px; }
        }
      `}</style>
      <SpaceBetween size="m">
        {/* Connection Status */}
        <ConnectionStatusIndicator callState={callState} voiceScriptRunning={voiceScriptRunning} />

        {/* Call Duration Timer + Agent Waveform (manual mode) */}
        {isInCall && (
          <div className="voice-timer-area">
            <Box variant="h2">{formatCallDuration(callDuration)}</Box>
            <div className={`voice-waveform ${agentVolume > 0 ? "voice-waveform-active" : ""}`}>
              <span className="voice-bar" style={{ animationDelay: "0ms" }} />
              <span className="voice-bar" style={{ animationDelay: "150ms" }} />
              <span className="voice-bar" style={{ animationDelay: "300ms" }} />
              <span className="voice-bar" style={{ animationDelay: "100ms" }} />
              <span className="voice-bar" style={{ animationDelay: "250ms" }} />
            </div>
          </div>
        )}

        {/* Waveform + Timer during script execution (not in manual call) */}
        {voiceScriptRunning && !synthesisProgress && !isInCall && (
          <div className="voice-timer-area">
            <Box variant="h2">{formatCallDuration(callDuration)}</Box>
            <div className={`voice-waveform ${voiceCustomerStreaming ? "voice-waveform-customer" : "voice-waveform-active"}`}>
              <span className="voice-bar" style={{ animationDelay: "0ms" }} />
              <span className="voice-bar" style={{ animationDelay: "150ms" }} />
              <span className="voice-bar" style={{ animationDelay: "300ms" }} />
              <span className="voice-bar" style={{ animationDelay: "100ms" }} />
              <span className="voice-bar" style={{ animationDelay: "250ms" }} />
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <StatusIndicator type="error">{errorMessage}</StatusIndicator>
        )}

        {/* Call Controls + PTT — same row */}
        <SpaceBetween size="s" direction="horizontal">
          {!canEndCall && !scriptMode && (
            <span className="voice-btn-start">
              <Button
                variant="primary"
                iconName="call"
                onClick={handleStartCall}
                disabled={!canStartCall}
              >
                Start Call
              </Button>
            </span>
          )}
          {canEndCall && (
            <span className="voice-btn-end">
              <Button variant="primary" onClick={handleEndCall}>
                End Call
              </Button>
            </span>
          )}
          {isInCall && !scriptMode && (
            <div ref={pttButtonRef as React.RefObject<HTMLDivElement>}>
              <Button
                variant={isTransmitting ? "primary" : "normal"}
                iconName={isTransmitting ? "microphone" : "microphone-off"}
              >
                {isTransmitting ? "Transmitting" : "Push to Talk"}
              </Button>
            </div>
          )}
        </SpaceBetween>

        {/* Agent Speaking Waveform — removed, now shown in timer area */}

        {/* Synthesis Progress (shown during script execution, passed from parent) */}
        {synthesisProgress && (
          <ProgressBar
            value={(synthesisProgress.current / synthesisProgress.total) * 100}
            additionalInfo={`Synthesizing ${synthesisProgress.current} of ${synthesisProgress.total}`}
            label="Pre-generating audio"
          />
        )}

        {/* Script running indicator */}
        {voiceScriptRunning && !synthesisProgress && (
          <Box textAlign="center">
            <StatusIndicator type="in-progress">Script executing...</StatusIndicator>
          </Box>
        )}

      </SpaceBetween>

      {/* Agent Switch Confirmation Modal */}
      <Modal
        visible={showAgentSwitchModal}
        onDismiss={handleAgentSwitchDismiss}
        header="Switch Agent"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleAgentSwitchDismiss}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAgentSwitchConfirm}>
                End Call & Switch
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>
          A voice call is currently active. Switching agents will end the current
          call. Do you want to proceed?
        </Box>
      </Modal>
    </Container>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConnectionStatusIndicator({ callState, voiceScriptRunning }: { callState: CallState; voiceScriptRunning?: boolean }) {
  let type: "success" | "info" | "warning" | "error" | "stopped" | "loading" = "stopped";
  let label = "Idle";

  // When a voice script is running (call managed externally), show "In Call"
  if (voiceScriptRunning) {
    type = "success";
    label = "In Call";
    return <StatusIndicator type={type}>{label}</StatusIndicator>;
  }

  switch (callState) {
    case "idle":
      type = "stopped";
      label = "Idle";
      break;
    case "connecting":
      type = "loading";
      label = "Connecting";
      break;
    case "in-call":
      type = "success";
      label = "In Call";
      break;
    case "ended":
      type = "info";
      label = "Ended";
      break;
    case "error":
      type = "error";
      label = "Error";
      break;
  }

  return <StatusIndicator type={type}>{label}</StatusIndicator>;
}
