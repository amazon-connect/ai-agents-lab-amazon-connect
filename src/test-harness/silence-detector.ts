// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type {
  SilenceDetectorState,
  SilenceDetectorConfig,
  SilenceDetectorCallbacks,
} from "./voice-types";

const DEFAULT_ACTIVITY_THRESHOLD = 0.01;
const DEFAULT_SILENCE_DURATION_MS = 2000;
const DEFAULT_CALLBACK_TIMEOUT_MS = 5000;

/**
 * Create a silence detector that monitors volume levels and emits
 * turn-complete signals based on silence duration after speech activity.
 *
 * State machine:
 *   idle → speaking (volume > threshold)
 *   speaking → silence (volume ≤ threshold)
 *   silence → speaking (volume > threshold, resets timer)
 *   silence → idle (timer expires → emit turnComplete)
 *   speaking → idle (callback timeout 5s → emit turnComplete)
 */
export function createSilenceDetector(
  config: SilenceDetectorConfig,
  callbacks: SilenceDetectorCallbacks
): {
  processVolume: (volume: number) => void;
  reset: () => void;
  destroy: () => void;
  getState: () => SilenceDetectorState;
} {
  const threshold = config.activityThreshold ?? DEFAULT_ACTIVITY_THRESHOLD;
  const silenceDurationMs = config.silenceDurationMs ?? DEFAULT_SILENCE_DURATION_MS;
  const callbackTimeoutMs = config.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;

  let state: SilenceDetectorState = "idle";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let callbackTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function setState(newState: SilenceDetectorState): void {
    if (state !== newState) {
      state = newState;
      callbacks.onStateChange?.(newState);
    }
  }

  function clearSilenceTimer(): void {
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function clearCallbackTimeout(): void {
    if (callbackTimeoutTimer !== null) {
      clearTimeout(callbackTimeoutTimer);
      callbackTimeoutTimer = null;
    }
  }

  function startSilenceTimer(): void {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      silenceTimer = null;
      setState("idle");
      callbacks.onTurnComplete();
    }, silenceDurationMs);
  }

  function resetCallbackTimeout(): void {
    clearCallbackTimeout();
    callbackTimeoutTimer = setTimeout(() => {
      callbackTimeoutTimer = null;
      clearSilenceTimer();
      setState("idle");
      callbacks.onTurnComplete();
    }, callbackTimeoutMs);
  }

  function processVolume(volume: number): void {
    if (destroyed) return;

    const isActive = volume > threshold;

    switch (state) {
      case "idle":
        if (isActive) {
          setState("speaking");
          resetCallbackTimeout();
        }
        break;

      case "speaking":
        if (isActive) {
          // Still speaking — reset the callback timeout
          resetCallbackTimeout();
        } else {
          // Volume dropped below threshold — transition to silence
          clearCallbackTimeout();
          setState("silence");
          startSilenceTimer();
        }
        break;

      case "silence":
        if (isActive) {
          // Speech resumed — cancel silence timer, go back to speaking
          clearSilenceTimer();
          setState("speaking");
          resetCallbackTimeout();
        }
        // If still silent, the timer continues running
        break;
    }
  }

  function reset(): void {
    if (destroyed) return;
    clearSilenceTimer();
    clearCallbackTimeout();
    setState("idle");
  }

  function destroy(): void {
    destroyed = true;
    clearSilenceTimer();
    clearCallbackTimeout();
  }

  function getState(): SilenceDetectorState {
    return state;
  }

  return { processVolume, reset, destroy, getState };
}
