// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Audio Streamer — streams pre-generated PCM buffers into a Chime session
 * via the Web Audio API.
 *
 * Creates an AudioContext at 16 kHz, decodes raw PCM (16-bit signed, mono)
 * into an AudioBuffer, connects AudioBufferSourceNode → MediaStreamDestinationNode,
 * and feeds the resulting MediaStream into the Chime session via startAudioInput().
 */

import { audioLog } from "./audio-debug";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StreamBufferParams {
  /** Raw PCM buffer (16-bit signed integers, 16kHz, mono) */
  pcmBuffer: ArrayBuffer;
  /** The Chime audioVideo facade to call startAudioInput on */
  audioVideo: unknown;
  /** If true, don't play audio through local speakers (used in batch mode) */
  muteLocalPlayback?: boolean;
}

export interface AudioStreamerCallbacks {
  /** Called when the buffer finishes playing */
  onEnded: () => void;
  /** Called if decoding fails */
  onError: (error: string) => void;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Decode a raw PCM buffer (16-bit signed integers, 16kHz, mono) into an AudioBuffer.
 * Web Audio API expects Float32 samples in the range [-1, 1].
 */
function decodePcmToAudioBuffer(
  pcmBuffer: ArrayBuffer,
  audioContext: AudioContext
): AudioBuffer {
  const int16Array = new Int16Array(pcmBuffer);
  const numSamples = int16Array.length;
  const audioBuffer = audioContext.createBuffer(1, numSamples, 16000);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    // Convert 16-bit signed integer [-32768, 32767] to float [-1, 1]
    channelData[i] = int16Array[i]! / 32768;
  }

  return audioBuffer;
}

/**
 * Stream a PCM buffer into the Chime session as microphone input.
 *
 * Creates an AudioContext (16kHz), decodes the PCM buffer, connects
 * AudioBufferSourceNode → MediaStreamDestinationNode, and calls
 * audioVideo.startAudioInput(mediaStream).
 *
 * Returns a cleanup function to stop playback and release resources.
 */
export function streamBuffer(
  params: StreamBufferParams,
  callbacks: AudioStreamerCallbacks
): () => void {
  const { pcmBuffer, audioVideo } = params;
  const { onEnded, onError } = callbacks;

  let audioContext: AudioContext | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;

    if (sourceNode) {
      try {
        sourceNode.onended = null;
        sourceNode.stop();
      } catch {
        // Already stopped or not started — safe to ignore
      }
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => {
        // Best-effort close — ignore errors
      });
      audioContext = null;
    }
  };

  try {
    audioLog("streamBuffer: start", { byteLength: pcmBuffer.byteLength });
    // Create AudioContext at 16kHz to match the PCM sample rate
    audioContext = new AudioContext({ sampleRate: 16000 });

    // Decode raw PCM into an AudioBuffer
    const audioBuffer = decodePcmToAudioBuffer(pcmBuffer, audioContext);

    // Create source node and assign the decoded buffer
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;

    // Create destination node to produce a MediaStream
    const destinationNode = audioContext.createMediaStreamDestination();

    // Connect: source → Chime destination (for agent to hear)
    sourceNode.connect(destinationNode);

    // Also connect to local speakers so the tester can hear the customer audio
    // (skipped in batch mode to avoid cacophony)
    if (!params.muteLocalPlayback) {
      sourceNode.connect(audioContext.destination);
    }

    // Fire onEnded when playback completes
    sourceNode.onended = () => {
      audioLog("streamBuffer: source.onended fired");
      if (!cleaned) {
        onEnded();
      }
    };

    // Feed the MediaStream into the Chime session, then start playback.
    // We await startAudioInput to ensure Chime has fully switched to the new
    // stream before audio plays — otherwise the first frames may be lost.
    const av = audioVideo as { startAudioInput: (stream: MediaStream) => Promise<void> };
    audioLog("streamBuffer: calling startAudioInput");
    av.startAudioInput(destinationNode.stream)
      .then(() => {
        audioLog("streamBuffer: startAudioInput resolved, calling source.start()");
        if (!cleaned && sourceNode) {
          sourceNode.start();
        }
      })
      .catch((err: unknown) => {
        if (!cleaned) {
          const message = err instanceof Error ? err.message : String(err);
          audioLog("streamBuffer: startAudioInput rejected", { message });
          onError(`Failed to start audio input: ${message}`);
          cleanup();
        }
      });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    onError(`Audio decode/setup failed: ${message}`);
    cleanup();
  }

  return cleanup;
}
