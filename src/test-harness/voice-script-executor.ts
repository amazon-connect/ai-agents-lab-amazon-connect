// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Voice Script Executor — orchestrates scripted voice test execution.
 *
 * Flow:
 * 1. Start WebRTC call (report session start with contactId)
 * 2. For each turn: stream audio → mute → wait for silence detection → record latency
 * 3. End call and report complete transcript
 *
 * Audio pre-generation (Polly synthesis) is the caller's responsibility.
 * The caller must provide pre-generated buffers via `utteranceBuffers`.
 *
 * Termination reasons:
 * - completed: all turns finished successfully
 * - max_timeout: 30s with no agent audio after streaming a customer utterance
 * - connection_lost: WebRTC connection closed unexpectedly
 * - decode_error: failed to decode a PCM buffer for a turn
 * - user_stopped: user cancelled via AbortSignal
 */

import type { AWSCredentials } from "../credentials/types";
import type { TestScript, ScriptProgress } from "./script-types";
import type {
  VoiceTerminationReason,
  VoiceTranscript,
  VoiceTurnTranscript,
  VoiceClientCallbacks,
  CallState,
} from "./voice-types";
import { startCall, endCall } from "./voice-client";
import { streamBuffer } from "./audio-streamer";
import { createSilenceDetector } from "./silence-detector";
import { audioLog } from "./audio-debug";
import { pickUtterance } from "./script-runner";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum time to wait for agent audio after streaming a customer utterance (ms). */
const AGENT_RESPONSE_TIMEOUT_MS = 45_000;

// ─── Public Types ────────────────────────────────────────────────────────────

export interface VoiceScriptCallbacks {
  onProgress: (progress: ScriptProgress) => void;
  onSessionStart: (contactId: string) => void;
  onCustomerAudioEnd: () => void;
  onAgentAudioStart: () => void;
  onTurnComplete: (turn: VoiceTurnTranscript) => void;
  onComplete: (transcript: VoiceTranscript) => void;
  onError: (error: string) => void;
}

export interface RunVoiceScriptParams {
  script: TestScript;
  agentArn: string;
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactFlowId: string;
  /** Pre-generated audio buffers keyed by utterance string. Required — synthesis is the caller's responsibility. */
  utteranceBuffers: Map<string, ArrayBuffer>;
  /** Whether to use random variation sampling when picking utterances. */
  useVariations?: boolean;
  /** Duration of silence (ms) before considering the agent's turn complete. Defaults to 2000. */
  silenceDurationMs?: number;
  /** If true, don't play audio through local speakers (used in batch mode). */
  muteLocalPlayback?: boolean;
  /**
   * If true, use a silent synthetic stream instead of the real microphone.
   * Customer audio comes from pre-generated Polly buffers anyway, so the mic
   * isn't needed for script-mode tests. Avoids OS mic flakiness.
   */
  mockMicrophone?: boolean;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Execute a scripted voice test:
 * 1. Start WebRTC call
 * 2. Stream each turn's audio, wait for silence-based turn detection
 * 3. End call and report transcript
 *
 * totalDurationMs measures from call connection established (onSessionStart) to call end,
 * aligning with how chat measures performance (from connection, not from script start).
 */
export async function runVoiceScript(
  params: RunVoiceScriptParams,
  callbacks: VoiceScriptCallbacks,
  signal: AbortSignal
): Promise<VoiceTranscript> {
  const { script, agentArn, credentials, region, instanceId, contactFlowId, silenceDurationMs } = params;
  const { utteranceBuffers, useVariations } = params;

  const completedTurns: VoiceTurnTranscript[] = [];
  let executionStartTimestamp: string | null = null;
  let connectionLost = false;

  // ─── Handle already-aborted signal ───────────────────────────────────────
  if (signal.aborted) {
    const transcript = buildTranscript(
      script,
      agentArn,
      "user_stopped",
      completedTurns,
      executionStartTimestamp
    );
    callbacks.onComplete(transcript);
    return transcript;
  }

  // ─── Start WebRTC call ──────────────────────────────────────────────────
  // Track connection state for detecting unexpected disconnects
  const voiceCallbacks: VoiceClientCallbacks = {
    onStateChange: (state: CallState) => {
      if (state === "error") {
        audioLog("connection lost (state=error)");
        connectionLost = true;
      }
    },
    onError: (error: string) => {
      audioLog("voice client error", { error });
      callbacks.onError(error);
    },
    onVolumeChange: () => {
      // Volume changes are handled per-turn via the silence detector
    },
  };

  let session;
  try {
    session = await startCall(
      {
        credentials, region, instanceId, contactFlowId, agentArn,
        muteLocalPlayback: params.muteLocalPlayback,
        mockMicrophone: params.mockMicrophone,
      },
      voiceCallbacks
    );
  } catch (error) {
    if (signal.aborted) {
      const transcript = buildTranscript(
        script,
        agentArn,
        "user_stopped",
        completedTurns,
        executionStartTimestamp
      );
      callbacks.onComplete(transcript);
      return transcript;
    }
    const message = error instanceof Error ? error.message : "Failed to start call";
    callbacks.onError(message);
    const transcript = buildTranscript(
      script,
      agentArn,
      "connection_lost",
      completedTurns,
      executionStartTimestamp
    );
    callbacks.onComplete(transcript);
    return transcript;
  }

  callbacks.onSessionStart(session.contactId);
  executionStartTimestamp = new Date().toISOString();

  // ─── Execute turns ──────────────────────────────────────────────────────
  const meetingSession = session.meetingSession as {
    audioVideo: {
      realtimeMuteLocalAudio: () => void;
      realtimeUnmuteLocalAudio: () => void;
      realtimeSubscribeToVolumeIndicator: (
        attendeeId: string,
        callback: (attendeeId: string, volume: number | null) => void
      ) => void;
      realtimeUnsubscribeFromVolumeIndicator: (
        attendeeId: string,
        callback: (attendeeId: string, volume: number | null) => void
      ) => void;
      realtimeSubscribeToAttendeeIdPresence: (
        callback: (attendeeId: string, present: boolean) => void
      ) => void;
      startAudioInput: (stream: MediaStream) => Promise<void>;
    };
  };

  const audioVideo = meetingSession.audioVideo;

  // Use the remote attendee ID captured during startCall (presence subscription
  // is set up before audioVideoDidStart, so it can't be missed).
  // If still null (edge case — remote hasn't joined yet), wait briefly.
  let remoteAttendeeId: string | null = session.remoteAttendeeRef.id;

  if (!remoteAttendeeId && !signal.aborted) {
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        remoteAttendeeId = session.remoteAttendeeRef.id;
        if (remoteAttendeeId || signal.aborted) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });
    remoteAttendeeId = session.remoteAttendeeRef.id;
  }  // ─── Wait for agent greeting to finish ──────────────────────────────────
  // In voice, the agent initiates the conversation with a greeting.
  // We must wait for the agent to finish speaking before sending the first customer turn.
  if (!signal.aborted && !connectionLost && remoteAttendeeId) {
    audioLog("waitForAgentSilence: start (waiting for greeting to finish)");
    await waitForAgentSilence(
      audioVideo,
      remoteAttendeeId,
      silenceDurationMs ?? 2000,
      signal,
      () => connectionLost
    );
    audioLog("waitForAgentSilence: complete");
  }

  let terminationReason: VoiceTerminationReason = "completed";

  for (let turnIndex = 0; turnIndex < script.turns.length; turnIndex++) {
    // Check for cancellation before each turn
    if (signal.aborted) {
      audioLog(`turn ${turnIndex}: aborted before start`);
      terminationReason = "user_stopped";
      break;
    }

    // Check for connection loss
    if (connectionLost) {
      audioLog(`turn ${turnIndex}: connection lost before start`);
      terminationReason = "connection_lost";
      break;
    }

    // Report progress
    callbacks.onProgress({
      currentTurn: turnIndex + 1,
      totalTurns: script.turns.length,
      state: "running",
    });

    // Execute this turn
    const turn = script.turns[turnIndex]!;
    const utterance = pickUtterance(turn, useVariations ?? false);
    const buffer = utteranceBuffers.get(utterance);
    audioLog(`turn ${turnIndex} start`, { utterance });
    const turnResult = await executeTurn(
      turnIndex,
      utterance,
      buffer!,
      audioVideo,
      signal,
      () => connectionLost,
      silenceDurationMs,
      remoteAttendeeId,
      params.muteLocalPlayback,
      () => callbacks.onCustomerAudioEnd(),
      () => callbacks.onAgentAudioStart()
    );
    audioLog(`turn ${turnIndex} complete`, { reason: turnResult.reason });

    if (turnResult.reason !== "completed") {
      terminationReason = turnResult.reason;
      if (turnResult.turn) {
        completedTurns.push(turnResult.turn);
        callbacks.onTurnComplete(turnResult.turn);
      }
      break;
    }

    completedTurns.push(turnResult.turn!);
    callbacks.onTurnComplete(turnResult.turn!);
  }

  // ─── End call and report transcript ─────────────────────────────────────
  try {
    await endCall(session);
  } catch {
    // Best-effort cleanup
  }


  const transcript = buildTranscript(
    script,
    agentArn,
    terminationReason,
    completedTurns,
    executionStartTimestamp
  );
  callbacks.onComplete(transcript);
  return transcript;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Wait for the agent to finish speaking (greeting) before starting scripted turns.
 * Uses the silence detector: waits for agent audio activity followed by silence.
 * Times out after 30 seconds if no agent audio is detected.
 */
function waitForAgentSilence(
  audioVideo: {
    realtimeSubscribeToVolumeIndicator: (
      attendeeId: string,
      callback: (attendeeId: string, volume: number | null) => void
    ) => void;
    realtimeUnsubscribeFromVolumeIndicator: (
      attendeeId: string,
      callback: (attendeeId: string, volume: number | null) => void
    ) => void;
  },
  remoteAttendeeId: string,
  silenceDurationMs: number,
  signal: AbortSignal,
  isConnectionLost: () => boolean
): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    let agentStartedSpeaking = false;

    const detector = createSilenceDetector(
      {
        activityThreshold: 0.01,
        silenceDurationMs,
        // Chime's volume indicator stops calling our callback when there's no
        // audio activity (rather than sending vol=0). We treat that as the
        // silence signal — so callbackTimeoutMs matches silenceDurationMs.
        callbackTimeoutMs: silenceDurationMs,
      },
      {
        onTurnComplete: () => {
          if (!resolved) {
            resolved = true;
            audioVideo.realtimeUnsubscribeFromVolumeIndicator(remoteAttendeeId, volumeCb);
            clearTimeout(timeout);
            resolve();
          }
        },
      }
    );

    // 30-second timeout in case agent never speaks
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        detector.destroy();
        audioVideo.realtimeUnsubscribeFromVolumeIndicator(remoteAttendeeId, volumeCb);
        resolve();
      }
    }, AGENT_RESPONSE_TIMEOUT_MS);

    // Abort handler
    const onAbort = () => {
      if (!resolved) {
        resolved = true;
        detector.destroy();
        audioVideo.realtimeUnsubscribeFromVolumeIndicator(remoteAttendeeId, volumeCb);
        clearTimeout(timeout);
        resolve();
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });

    const volumeCb = (_attendeeId: string, volume: number | null) => {
      if (resolved) return;
      if (isConnectionLost()) {
        resolved = true;
        detector.destroy();
        clearTimeout(timeout);
        resolve();
        return;
      }

      const vol = volume ?? 0;

      // Only start feeding the detector once agent has started speaking
      if (vol > 0.01) {
        agentStartedSpeaking = true;
      }

      if (agentStartedSpeaking) {
        detector.processVolume(vol);
      }
    };

    audioVideo.realtimeSubscribeToVolumeIndicator(remoteAttendeeId, volumeCb);
  });
}

interface TurnResult {
  reason: VoiceTerminationReason;
  turn: VoiceTurnTranscript | null;
}

/**
 * Execute a single turn:
 * 1. Unmute and stream the PCM buffer
 * 2. Wait for playback to end, then mute
 * 3. Wait for silence detection (agent finished speaking)
 * 4. Record latency metrics
 */
function executeTurn(
  turnIndex: number,
  customerUtterance: string,
  pcmBuffer: ArrayBuffer,
  audioVideo: {
    realtimeMuteLocalAudio: () => void;
    realtimeUnmuteLocalAudio: () => void;
    realtimeSubscribeToVolumeIndicator: (
      attendeeId: string,
      callback: (attendeeId: string, volume: number | null) => void
    ) => void;
    realtimeUnsubscribeFromVolumeIndicator: (
      attendeeId: string,
      callback: (attendeeId: string, volume: number | null) => void
    ) => void;
    startAudioInput: (stream: MediaStream) => Promise<void>;
  },
  signal: AbortSignal,
  isConnectionLost: () => boolean,
  silenceDurationMs?: number,
  remoteAttendeeId?: string | null,
  muteLocalPlayback?: boolean,
  onCustomerAudioEnd?: () => void,
  onAgentAudioStart?: () => void
): Promise<TurnResult> {
  return new Promise<TurnResult>((resolve) => {
    let resolved = false;
    let streamCleanup: (() => void) | null = null;
    let silenceDetector: ReturnType<typeof createSilenceDetector> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let firstAgentAudioTimestamp: string | null = null;
    let customerAudioEndTimestamp: string | null = null;
    let volumeCallback: ((attendeeId: string, volume: number | null) => void) | null = null;
    // Use the remote attendee ID for volume subscription (wildcard doesn't work)
    const volumeAttendeeId = remoteAttendeeId ?? "";

    function finish(reason: VoiceTerminationReason): void {
      if (resolved) return;
      resolved = true;

      // Clean up resources
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (silenceDetector) {
        silenceDetector.destroy();
        silenceDetector = null;
      }
      if (streamCleanup) {
        streamCleanup();
        streamCleanup = null;
      }

      // Build turn transcript if we have timing data
      const now = new Date().toISOString();
      const firstAudio = firstAgentAudioTimestamp ?? now;
      // latencyMs = time from customer stopped talking → agent started talking
      const startPoint = customerAudioEndTimestamp ?? now;
      const latencyMs = Date.parse(firstAudio) - Date.parse(startPoint);
      const agentResponseDurationMs = Date.parse(now) - Date.parse(firstAudio);

      const turn: VoiceTurnTranscript = {
        turnIndex,
        customerUtterance,
        sendTimestamp: customerAudioEndTimestamp ?? now,
        firstAgentAudioTimestamp: firstAudio,
        agentResponseDurationMs: Math.max(0, agentResponseDurationMs),
        latencyMs: Math.max(0, latencyMs),
      };

      resolve({ reason, turn });
    }

    // Handle abort signal
    function handleAbort(): void {
      finish("user_stopped");
    }

    if (signal.aborted) {
      finish("user_stopped");
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });

    // Start the 30-second agent response timeout
    function startAgentTimeout(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        timeoutId = null;
        finish("max_timeout");
      }, AGENT_RESPONSE_TIMEOUT_MS);
    }

    // Step 1: Unmute and stream the audio buffer
    audioLog(`executeTurn ${turnIndex}: unmuting and starting streamBuffer`);
    audioVideo.realtimeUnmuteLocalAudio();

    streamCleanup = streamBuffer(
      { pcmBuffer, audioVideo, muteLocalPlayback },
      {
        onEnded: () => {
          // Step 2: Playback complete — mute and start monitoring for agent response
          audioLog(`executeTurn ${turnIndex}: customer audio ended, muting`);
          audioVideo.realtimeMuteLocalAudio();
          customerAudioEndTimestamp = new Date().toISOString();
          onCustomerAudioEnd?.();

          // Start the 30-second timeout for agent response
          startAgentTimeout();

          // Step 3: Set up silence detector to detect when agent finishes speaking
          silenceDetector = createSilenceDetector(
            {
              activityThreshold: 0.01,
              silenceDurationMs: silenceDurationMs ?? 2000,
              // Chime's volume indicator stops calling our callback when there's no
              // audio activity (rather than sending vol=0). We treat that as the
              // silence signal — so callbackTimeoutMs matches silenceDurationMs.
              callbackTimeoutMs: silenceDurationMs ?? 2000,
            },
            {
              onTurnComplete: () => {
                // Agent finished speaking — turn is complete
                signal.removeEventListener("abort", handleAbort);
                finish("completed");
              },
            }
          );

          // Subscribe to volume indicators for remote attendees
          volumeCallback = (_attendeeId: string, volume: number | null) => {
            if (resolved) return;

            // Check for connection loss
            if (isConnectionLost()) {
              signal.removeEventListener("abort", handleAbort);
              finish("connection_lost");
              return;
            }

            const vol = volume ?? 0;

            // Record first agent audio timestamp
            if (vol > 0.01 && firstAgentAudioTimestamp === null) {
              firstAgentAudioTimestamp = new Date().toISOString();
              audioLog(`executeTurn ${turnIndex}: first agent audio detected`, { vol });
              onAgentAudioStart?.();
              // Reset timeout — agent is responding
              if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }
            }

            // Only feed volume to silence detector after agent has started speaking
            // This prevents premature turn-complete from pre-speech silence
            if (firstAgentAudioTimestamp !== null && silenceDetector) {
              silenceDetector.processVolume(vol);
            }
          };

          audioVideo.realtimeSubscribeToVolumeIndicator(
            volumeAttendeeId,
            volumeCallback
          );
        },

        onError: (error: string) => {
          // Audio decode failure
          callbacks_onError_noop(error);
          signal.removeEventListener("abort", handleAbort);
          finish("decode_error");
        },
      }
    );
  });
}

/**
 * Build the final VoiceTranscript from completed turns.
 */
function buildTranscript(
  script: TestScript,
  agentArn: string,
  terminationReason: VoiceTerminationReason,
  completedTurns: VoiceTurnTranscript[],
  executionStartTimestamp: string | null
): VoiceTranscript {
  const now = new Date().toISOString();
  const startTime = executionStartTimestamp ?? now;
  const totalDurationMs = Date.parse(now) - Date.parse(startTime);

  const transcript: VoiceTranscript = {
    scriptName: script.name,
    agentArn,
    terminationReason,
    totalDurationMs: Math.max(0, totalDurationMs),
    turnsCompleted: completedTurns.length,
    turnsTotal: script.turns.length,
    turns: completedTurns,
  };

  if (terminationReason !== "completed") {
    transcript.stoppedAtIndex = completedTurns.length;
  }

  return transcript;
}

/**
 * No-op error handler used inside executeTurn where we don't have
 * direct access to the outer callbacks. The error is communicated
 * via the TurnResult reason instead.
 */
function callbacks_onError_noop(_error: string): void {
  // Intentionally empty — error is communicated via finish("decode_error")
}
