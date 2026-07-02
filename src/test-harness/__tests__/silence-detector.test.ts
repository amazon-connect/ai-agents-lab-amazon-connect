// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSilenceDetector } from "../silence-detector";
import type {
  SilenceDetectorConfig,
  SilenceDetectorCallbacks,
} from "../voice-types";

describe("createSilenceDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(config: SilenceDetectorConfig = {}) {
    const onTurnComplete = vi.fn();
    const onStateChange = vi.fn();
    const callbacks: SilenceDetectorCallbacks = { onTurnComplete, onStateChange };
    const detector = createSilenceDetector(config, callbacks);
    return { detector, onTurnComplete, onStateChange };
  }

  describe("initial state", () => {
    it("starts in idle state", () => {
      const { detector } = setup();
      expect(detector.getState()).toBe("idle");
    });
  });

  describe("state transitions", () => {
    it("transitions from idle to speaking when volume exceeds threshold", () => {
      const { detector, onStateChange } = setup();
      detector.processVolume(0.05);
      expect(detector.getState()).toBe("speaking");
      expect(onStateChange).toHaveBeenCalledWith("speaking");
    });

    it("remains in idle when volume is at or below threshold", () => {
      const { detector, onStateChange } = setup();
      detector.processVolume(0.01);
      expect(detector.getState()).toBe("idle");
      detector.processVolume(0.0);
      expect(detector.getState()).toBe("idle");
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it("transitions from speaking to silence when volume drops below threshold", () => {
      const { detector, onStateChange } = setup();
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence
      expect(detector.getState()).toBe("silence");
      expect(onStateChange).toHaveBeenCalledWith("silence");
    });

    it("transitions from silence back to speaking when volume rises", () => {
      const { detector, onStateChange } = setup();
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence
      detector.processVolume(0.05); // silence → speaking
      expect(detector.getState()).toBe("speaking");
      expect(onStateChange).toHaveBeenLastCalledWith("speaking");
    });
  });

  describe("turn-complete emission", () => {
    it("emits onTurnComplete after 2s of continuous silence following speech", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence

      vi.advanceTimersByTime(1999);
      expect(onTurnComplete).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(detector.getState()).toBe("idle");
    });

    it("resets silence timer when volume rises before 2s elapses", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence

      vi.advanceTimersByTime(1500); // 1.5s of silence
      expect(onTurnComplete).not.toHaveBeenCalled();

      detector.processVolume(0.05); // silence → speaking (resets timer)
      detector.processVolume(0.005); // speaking → silence (new timer)

      vi.advanceTimersByTime(1999);
      expect(onTurnComplete).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
    });

    it("does not emit turn-complete if no speech was detected", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.0);
      detector.processVolume(0.005);
      detector.processVolume(0.01);

      vi.advanceTimersByTime(10000);
      expect(onTurnComplete).not.toHaveBeenCalled();
      expect(detector.getState()).toBe("idle");
    });
  });

  describe("callback timeout", () => {
    it("emits onTurnComplete after 5s without volume updates while speaking", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking

      vi.advanceTimersByTime(4999);
      expect(onTurnComplete).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(detector.getState()).toBe("idle");
    });

    it("resets callback timeout when volume updates continue while speaking", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking

      vi.advanceTimersByTime(3000);
      detector.processVolume(0.08); // still speaking, resets timeout

      vi.advanceTimersByTime(4999);
      expect(onTurnComplete).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe("custom config", () => {
    it("uses custom activity threshold", () => {
      const { detector } = setup({ activityThreshold: 0.1 });
      detector.processVolume(0.05); // below custom threshold
      expect(detector.getState()).toBe("idle");

      detector.processVolume(0.15); // above custom threshold
      expect(detector.getState()).toBe("speaking");
    });

    it("uses custom silence duration", () => {
      const { detector, onTurnComplete } = setup({ silenceDurationMs: 500 });
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence

      vi.advanceTimersByTime(499);
      expect(onTurnComplete).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
    });

    it("uses custom callback timeout", () => {
      const { detector, onTurnComplete } = setup({ callbackTimeoutMs: 3000 });
      detector.processVolume(0.05); // idle → speaking

      vi.advanceTimersByTime(2999);
      expect(onTurnComplete).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe("reset()", () => {
    it("returns to idle state and clears timers", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence

      detector.reset();
      expect(detector.getState()).toBe("idle");

      vi.advanceTimersByTime(5000);
      expect(onTurnComplete).not.toHaveBeenCalled();
    });

    it("clears callback timeout timer", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking

      detector.reset();
      expect(detector.getState()).toBe("idle");

      vi.advanceTimersByTime(10000);
      expect(onTurnComplete).not.toHaveBeenCalled();
    });
  });

  describe("destroy()", () => {
    it("cleans up all timers and stops processing", () => {
      const { detector, onTurnComplete } = setup();
      detector.processVolume(0.05); // idle → speaking
      detector.processVolume(0.005); // speaking → silence

      detector.destroy();

      vi.advanceTimersByTime(10000);
      expect(onTurnComplete).not.toHaveBeenCalled();
    });

    it("ignores processVolume calls after destroy", () => {
      const { detector, onStateChange } = setup();
      detector.destroy();

      detector.processVolume(0.5);
      expect(detector.getState()).toBe("idle");
      expect(onStateChange).not.toHaveBeenCalled();
    });
  });
});
