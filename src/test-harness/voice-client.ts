// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  StartWebRTCContactCommand,
} from "@aws-sdk/client-connect";
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
  MeetingSessionStatusCode,
} from "amazon-chime-sdk-js";
import type { AudioVideoObserver } from "amazon-chime-sdk-js";
import type {
  CallState,
  StartCallParams,
  VoiceClientCallbacks,
  VoiceSession,
} from "./voice-types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Normalize an agent ARN to include a version suffix.
 * Appends `:$LATEST` if the ARN does not already contain a version suffix
 * (i.e., does not end with `:<something>` after the alias/version segment).
 *
 * An ARN with a version suffix looks like:
 *   arn:aws:lex:us-east-1:123456789012:bot-alias/BOTID/ALIASID:$LATEST
 *   arn:aws:lex:us-east-1:123456789012:bot-alias/BOTID/ALIASID:42
 *
 * An ARN without a version suffix:
 *   arn:aws:lex:us-east-1:123456789012:bot-alias/BOTID/ALIASID
 */
export function normalizeAgentArn(arn: string): string {
  // Check if the ARN already ends with a version suffix pattern
  // A version suffix is `:$LATEST` or `:<digits>` at the end of the ARN
  const versionSuffixPattern = /:\$LATEST$|:\d+$/;
  if (versionSuffixPattern.test(arn)) {
    return arn;
  }
  return `${arn}:$LATEST`;
}

/**
 * Format elapsed seconds as MM:SS string for the call duration timer.
 */
export function formatCallDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── Call Lifecycle Functions ─────────────────────────────────────────────────

/** Internal state tracking for call guard (used by manual mode UI) */
let currentCallState: CallState = "idle";

/**
 * Get the current call state (used for start call guard).
 */
export function getCallState(): CallState {
  return currentCallState;
}

/**
 * Reset the call state to idle (used for testing and cleanup).
 */
export function resetCallState(): void {
  currentCallState = "idle";
}

/**
 * Start a WebRTC voice contact.
 *
 * Flow:
 * 1. Guard: reject if Call_State is not idle
 * 2. Transition to "connecting"
 * 3. Call StartWebRTCContact with instanceId, contactFlowId, and testAgentArn attribute
 * 4. Extract Meeting + Attendee from ConnectionData
 * 5. Create MeetingSessionConfiguration
 * 6. Instantiate DefaultMeetingSession
 * 7. Subscribe to volume indicators
 * 8. Register audioVideoDidStart / audioVideoDidStop observers
 * 9. Call audioVideo.start()
 * 10. Wait for audioVideoDidStart (15-second timeout)
 * 11. Bind audio element, start muted
 * 12. Transition to "in-call"
 */
export async function startCall(
  params: StartCallParams,
  callbacks: VoiceClientCallbacks
): Promise<VoiceSession> {
  const { credentials, region, instanceId, contactFlowId, agentArn, muteLocalPlayback, mockMicrophone } = params;

  currentCallState = "connecting";
  callbacks.onStateChange("connecting");

  try {
    // Step 1: Call StartWebRTCContact
    const connectClient = new ConnectClient({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const normalizedArn = normalizeAgentArn(agentArn);

    const response = await withRetry(
      () =>
        connectClient.send(
          new StartWebRTCContactCommand({
            InstanceId: instanceId,
            ContactFlowId: contactFlowId,
            ParticipantDetails: { DisplayName: "Customer" },
            Attributes: {
              testAgentArn: normalizedArn,
            },
          })
        ),
      DEFAULT_RETRY_CONFIG
    );

    const contactId = response.ContactId ?? "";
    const participantToken = response.ParticipantToken ?? "";
    const connectionData = response.ConnectionData;

    if (!connectionData?.Meeting || !connectionData?.Attendee) {
      throw new Error(
        "StartWebRTCContact response missing Meeting or Attendee data"
      );
    }

    // Step 2: Create MeetingSessionConfiguration from ConnectionData
    const meetingResponse = {
      Meeting: {
        MeetingId: connectionData.Meeting.MeetingId,
        MediaRegion: connectionData.Meeting.MediaRegion,
        MediaPlacement: {
          AudioHostUrl: connectionData.Meeting.MediaPlacement?.AudioHostUrl,
          AudioFallbackUrl:
            connectionData.Meeting.MediaPlacement?.AudioFallbackUrl,
          SignalingUrl: connectionData.Meeting.MediaPlacement?.SignalingUrl,
          TurnControlUrl:
            connectionData.Meeting.MediaPlacement?.TurnControlUrl,
          EventIngestionUrl:
            connectionData.Meeting.MediaPlacement?.EventIngestionUrl,
        },
        MeetingFeatures: connectionData.Meeting.MeetingFeatures
          ? {
              Audio: {
                EchoReduction:
                  connectionData.Meeting.MeetingFeatures.Audio?.EchoReduction,
              },
            }
          : undefined,
      },
    };

    const attendeeResponse = {
      Attendee: {
        AttendeeId: connectionData.Attendee.AttendeeId,
        JoinToken: connectionData.Attendee.JoinToken,
      },
    };

    const configuration = new MeetingSessionConfiguration(
      meetingResponse,
      attendeeResponse
    );

    // Step 3: Instantiate DefaultMeetingSession
    const logger = new ConsoleLogger("VoiceTestHarness", LogLevel.WARN);
    const deviceController = new DefaultDeviceController(logger);
    const meetingSession = new DefaultMeetingSession(
      configuration,
      logger,
      deviceController
    );

    const audioVideo = meetingSession.audioVideo;

    // Step 4: Subscribe to volume indicators for remote attendees.
    // Use a shared mutable container so voice-script-executor can read
    // the live value even after startCall resolves.
    const remoteAttendeeRef = { id: null as string | null };
    audioVideo.realtimeSubscribeToAttendeeIdPresence(
      (attendeeId: string, present: boolean) => {
        if (present && attendeeId !== configuration.credentials!.attendeeId) {
          remoteAttendeeRef.id = attendeeId;
          // Subscribe to their volume
          audioVideo.realtimeSubscribeToVolumeIndicator(
            attendeeId,
            (_id, volume) => {
              callbacks.onVolumeChange(attendeeId, volume ?? 0);
            }
          );
        }
      }
    );

    // Step 5: Register lifecycle observers and start audio
    const session = await new Promise<VoiceSession>((resolve, reject) => {
      const startTimeout = setTimeout(() => {
        audioVideo.stop();
        currentCallState = "error";
        callbacks.onStateChange("error");
        reject(
          new Error(
            "Chime session timed out: audioVideoDidStart not received within 15 seconds"
          )
        );
      }, 15_000);

      const observer: AudioVideoObserver = {
        audioVideoDidStart: async () => {
          clearTimeout(startTimeout);

          // Bind audio element for agent audio playback
          const audioElement = document.createElement("audio");
          audioElement.id = `voice-test-harness-audio-${contactId}`;
          audioElement.autoplay = !muteLocalPlayback;
          audioElement.muted = !!muteLocalPlayback;
          document.body.appendChild(audioElement);

          try {
            await audioVideo.bindAudioElement(audioElement);
          } catch (bindError) {
            audioVideo.stop();
            document.body.removeChild(audioElement);
            currentCallState = "error";
            callbacks.onStateChange("error");
            callbacks.onError(
              `Failed to bind audio element: ${bindError instanceof Error ? bindError.message : String(bindError)}`
            );
            reject(new Error("Failed to bind audio output element"));
            return;
          }

          // Audio input setup: either the real microphone (manual mode) or a
          // silent synthetic stream (script mode). The synthetic stream avoids
          // unreliable OS mic acquisition for tests that don't need real audio
          // input — customer audio comes from pre-generated Polly buffers.
          try {
            let inputStream: MediaStream;
            if (mockMicrophone) {
              const dummyContext = new AudioContext({ sampleRate: 16000 });
              const dummyDest = dummyContext.createMediaStreamDestination();
              const gain = dummyContext.createGain();
              gain.gain.value = 0;
              const osc = dummyContext.createOscillator();
              osc.connect(gain);
              gain.connect(dummyDest);
              osc.start();
              inputStream = dummyDest.stream;
            } else {
              inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            await audioVideo.startAudioInput(inputStream);
          } catch (micError) {
            audioVideo.stop();
            document.body.removeChild(audioElement);
            currentCallState = "error";
            callbacks.onStateChange("error");
            const message = mockMicrophone
              ? `Audio input setup failed: ${micError instanceof Error ? micError.message : String(micError)}`
              : `Microphone access denied: ${micError instanceof Error ? micError.message : String(micError)}`;
            callbacks.onError(message);
            reject(new Error(mockMicrophone ? "Audio input setup failed" : "Microphone permission denied"));
            return;
          }

          // Start muted (PTT mode — requirement 3.6)
          audioVideo.realtimeMuteLocalAudio();

          currentCallState = "in-call";
          callbacks.onStateChange("in-call");

          resolve({
            contactId,
            participantToken,
            meetingSession,
            remoteAttendeeRef,
          });
        },

        audioVideoDidStop: (sessionStatus) => {
          clearTimeout(startTimeout);

          // Check if this is an unexpected disconnect (requirement 2.6)
          const statusCode = sessionStatus.statusCode();
          if (
            statusCode !== MeetingSessionStatusCode.OK &&
            statusCode !== MeetingSessionStatusCode.Left
          ) {
            currentCallState = "error";
            callbacks.onStateChange("error");
            callbacks.onError(
              `Unexpected disconnect: ${sessionStatus.statusCode()}`
            );
          }
        },
      };

      audioVideo.addObserver(observer);
      audioVideo.start();
    });

    return session;
  } catch (error) {
    if (currentCallState === "connecting") {
      currentCallState = "error";
      callbacks.onStateChange("error");
    }
    const message =
      error instanceof Error ? error.message : "Failed to start voice call";
    callbacks.onError(message);
    throw error;
  }
}


/**
 * End an active voice call.
 *
 * Flow:
 * 1. Call audioVideo.stop()
 * 2. Release microphone tracks
 * 3. Unbind and remove audio element
 * 4. Transition to idle
 *
 * Per requirement 5.8: if audioVideo.stop() throws, still clean up resources.
 */
export async function endCall(session: VoiceSession): Promise<void> {
  const meetingSession = session.meetingSession as DefaultMeetingSession;
  const audioVideo = meetingSession.audioVideo;

  // Step 1: Stop the Chime session — wait for audioVideoDidStop to fire
  // so we don't proceed with cleanup (or start a new call) before teardown
  // is complete. This is critical for serial batch iterations where the next
  // call starts immediately after this one ends.
  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const observer: AudioVideoObserver = {
      audioVideoDidStop: () => {
        audioVideo.removeObserver(observer);
        settle();
      },
    };
    audioVideo.addObserver(observer);

    try {
      audioVideo.stop();
    } catch {
      // If stop() throws, still resolve — we'll continue cleanup
      audioVideo.removeObserver(observer);
      settle();
    }

    // Safety timeout — don't hang forever waiting for teardown
    setTimeout(() => {
      audioVideo.removeObserver(observer);
      settle();
    }, 5000);
  });

  // Step 2: Release microphone tracks via the device controller
  try {
    await audioVideo.stopAudioInput();
  } catch {
    // Best effort cleanup
  }

  // Step 3: Unbind and remove audio element
  try {
    audioVideo.unbindAudioElement();
  } catch {
    // Best effort
  }

  const audioElement = document.getElementById(`voice-test-harness-audio-${session.contactId}`);
  if (audioElement) {
    document.body.removeChild(audioElement);
  }

  // Step 4: Transition to idle
  currentCallState = "idle";
}
