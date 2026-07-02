// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AWSCredentials } from "../credentials/types";

// --- Call State ---

/** Lifecycle state of a voice session. */
export type CallState = "idle" | "connecting" | "in-call" | "ended" | "error";

// --- Voice Client Types ---

/** Parameters required to initiate a WebRTC voice contact. */
export interface StartCallParams {
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  contactFlowId: string;
  agentArn: string;
  /** If true, mute agent audio playback (used in batch mode). */
  muteLocalPlayback?: boolean;
  /**
   * If true, use a silent synthetic stream instead of the real microphone.
   * Used in script-mode tests where customer audio comes from pre-generated
   * Polly buffers, not the mic. Avoids unreliable OS mic acquisition.
   */
  mockMicrophone?: boolean;
}

/** Active voice session data returned after a successful call start. */
export interface VoiceSession {
  contactId: string;
  participantToken: string;
  meetingSession: unknown; // DefaultMeetingSession from amazon-chime-sdk-js
  /** Mutable ref to the remote attendee ID — updated live as presence events arrive. */
  remoteAttendeeRef: { id: string | null };
}

/** Callbacks for voice client state and event notifications. */
export interface VoiceClientCallbacks {
  onStateChange: (state: CallState) => void;
  onError: (error: string) => void;
  onVolumeChange: (attendeeId: string, volume: number) => void;
}

// --- Voice Script Execution Types ---

/** Reason a scripted voice execution terminated. */
export type VoiceTerminationReason =
  | "completed"
  | "max_timeout"
  | "connection_lost"
  | "decode_error"
  | "user_stopped";

/** Complete transcript of a scripted voice execution. */
export interface VoiceTranscript {
  scriptName: string;
  agentArn: string;
  terminationReason: VoiceTerminationReason;
  totalDurationMs: number;
  turnsCompleted: number;
  turnsTotal: number;
  stoppedAtIndex?: number;
  turns: VoiceTurnTranscript[];
}

/** Record of a single completed voice turn with latency metrics. */
export interface VoiceTurnTranscript {
  turnIndex: number;
  customerUtterance: string;
  sendTimestamp: string; // ISO 8601 — when audio streaming started
  firstAgentAudioTimestamp: string; // ISO 8601 — when agent volume first > 0
  agentResponseDurationMs: number; // first agent audio → silence detected
  latencyMs: number; // sendTimestamp → firstAgentAudioTimestamp
}

// --- Silence Detector Types ---

/** State of the silence detector state machine. */
export type SilenceDetectorState = "idle" | "speaking" | "silence";

/** Configuration for the silence detector. */
export interface SilenceDetectorConfig {
  /** Volume threshold below which audio is considered silent (default: 0.01). */
  activityThreshold?: number;
  /** Duration of continuous silence to trigger turn-complete (default: 2000ms). */
  silenceDurationMs?: number;
  /** Timeout for stalled callbacks while speaking (default: 5000ms). */
  callbackTimeoutMs?: number;
}

/** Callbacks emitted by the silence detector. */
export interface SilenceDetectorCallbacks {
  onTurnComplete: () => void;
  onStateChange?: (state: SilenceDetectorState) => void;
}

// --- Polly Synthesizer Types ---

/** A Polly voice available for synthesis. */
export interface PollyVoice {
  voiceId: string;
  name: string;
  gender: "Female" | "Male";
  languageCode: string;
  languageName: string;
  engine: "generative" | "neural" | "standard";
}

/** Parameters for synthesizing utterances via Amazon Polly. */
export interface SynthesizeParams {
  utterances: string[];
  credentials: AWSCredentials;
  region: string;
  /** Polly voice ID to use (default: "Ruth"). */
  voiceId?: string;
  /** Polly engine to use (default: "generative"). */
  engine?: "generative" | "neural" | "standard";
  signal?: AbortSignal;
  onProgress?: (progress: SynthesisProgress) => void;
}

/** Result of pre-generating audio buffers from utterances. */
export interface SynthesisResult {
  buffers: ArrayBuffer[]; // Indexed by turn number
}

/** Progress update during audio synthesis. */
export interface SynthesisProgress {
  currentIndex: number; // 0-based
  totalCount: number;
}
