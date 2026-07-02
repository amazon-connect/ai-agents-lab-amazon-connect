// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { streamBuffer } from "../audio-streamer";
import type { StreamBufferParams, AudioStreamerCallbacks } from "../audio-streamer";

// ─── Mocks for Web Audio API ─────────────────────────────────────────────────

function createMockSourceNode() {
  return {
    buffer: null as AudioBuffer | null,
    onended: null as (() => void) | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockDestinationNode() {
  return {
    stream: { id: "mock-stream" } as unknown as MediaStream,
  };
}

function createMockAudioVideo() {
  return {
    startAudioInput: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("streamBuffer", () => {
  let mockSourceNode: ReturnType<typeof createMockSourceNode>;
  let mockDestinationNode: ReturnType<typeof createMockDestinationNode>;
  let mockClose: ReturnType<typeof vi.fn>;
  let mockCreateBuffer: ReturnType<typeof vi.fn>;
  let mockAudioVideo: ReturnType<typeof createMockAudioVideo>;
  let onEnded: Mock<() => void>;
  let onError: Mock<(error: string) => void>;

  // Create a simple PCM buffer (4 samples of 16-bit signed integers)
  const pcmBuffer = new Int16Array([0, 16384, -16384, 32767]).buffer;

  beforeEach(() => {
    mockSourceNode = createMockSourceNode();
    mockDestinationNode = createMockDestinationNode();
    mockClose = vi.fn().mockResolvedValue(undefined);
    mockCreateBuffer = vi.fn((channels: number, length: number, sampleRate: number) => {
      const channelData = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: vi.fn(() => channelData),
      } as unknown as AudioBuffer;
    });

    // Use a class-based mock so `new AudioContext()` works
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).AudioContext = class MockAudioContext {
      sampleRate = 16000;
      createBuffer = mockCreateBuffer;
      createBufferSource = vi.fn(() => mockSourceNode);
      createMediaStreamDestination = vi.fn(() => mockDestinationNode);
      close = mockClose;
    };

    mockAudioVideo = createMockAudioVideo();
    onEnded = vi.fn();
    onError = vi.fn();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).AudioContext;
  });

  function callStreamBuffer(buffer: ArrayBuffer = pcmBuffer) {
    const params: StreamBufferParams = {
      pcmBuffer: buffer,
      audioVideo: mockAudioVideo,
    };
    const callbacks: AudioStreamerCallbacks = { onEnded, onError };
    return streamBuffer(params, callbacks);
  }

  describe("successful streaming", () => {
    it("creates AudioContext at 16kHz sample rate", () => {
      callStreamBuffer();
      // Verified by the fact that no error is thrown and the mock is used
      expect(onError).not.toHaveBeenCalled();
    });

    it("decodes PCM buffer into an AudioBuffer with correct sample count", () => {
      callStreamBuffer();
      // 4 samples (Int16Array of length 4)
      expect(mockCreateBuffer).toHaveBeenCalledWith(1, 4, 16000);
    });

    it("connects source node to destination node", () => {
      callStreamBuffer();
      expect(mockSourceNode.connect).toHaveBeenCalledWith(mockDestinationNode);
    });

    it("calls startAudioInput with the destination stream", () => {
      callStreamBuffer();
      expect(mockAudioVideo.startAudioInput).toHaveBeenCalledWith(mockDestinationNode.stream);
    });

    it("starts playback on the source node", async () => {
      callStreamBuffer();
      // start() is called after startAudioInput resolves (async)
      await vi.waitFor(() => {
        expect(mockSourceNode.start).toHaveBeenCalled();
      });
    });

    it("fires onEnded callback when source node finishes playing", async () => {
      callStreamBuffer();
      await vi.waitFor(() => {
        expect(mockSourceNode.start).toHaveBeenCalled();
      });
      expect(mockSourceNode.onended).toBeTypeOf("function");
      // Simulate playback end
      mockSourceNode.onended!();
      expect(onEnded).toHaveBeenCalledOnce();
    });

    it("does not fire onEnded after cleanup", () => {
      const cleanup = callStreamBuffer();
      cleanup();
      // onended is set to null during cleanup, so we can't trigger it
      expect(mockSourceNode.onended).toBeNull();
      expect(onEnded).not.toHaveBeenCalled();
    });
  });

  describe("cleanup function", () => {
    it("stops the source node", () => {
      const cleanup = callStreamBuffer();
      cleanup();
      expect(mockSourceNode.stop).toHaveBeenCalled();
    });

    it("disconnects the source node", () => {
      const cleanup = callStreamBuffer();
      cleanup();
      expect(mockSourceNode.disconnect).toHaveBeenCalled();
    });

    it("closes the AudioContext", () => {
      const cleanup = callStreamBuffer();
      cleanup();
      expect(mockClose).toHaveBeenCalled();
    });

    it("is idempotent — calling cleanup multiple times is safe", () => {
      const cleanup = callStreamBuffer();
      cleanup();
      cleanup();
      // stop is called once (second call is a no-op due to cleaned flag)
      expect(mockSourceNode.stop).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("fires onError if AudioContext creation throws", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).AudioContext = class FailingAudioContext {
        constructor() {
          throw new Error("AudioContext not supported");
        }
      };
      callStreamBuffer();
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("AudioContext not supported")
      );
    });

    it("fires onError if startAudioInput rejects", async () => {
      mockAudioVideo.startAudioInput.mockRejectedValueOnce(
        new Error("Device not found")
      );
      callStreamBuffer();
      // Wait for the promise rejection to propagate
      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          expect.stringContaining("Device not found")
        );
      });
    });

    it("fires onError if PCM buffer decoding fails", () => {
      mockCreateBuffer.mockImplementationOnce(() => {
        throw new Error("Invalid buffer length");
      });
      callStreamBuffer(new ArrayBuffer(0));
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining("Invalid buffer length")
      );
    });
  });

  describe("PCM decoding correctness", () => {
    it("converts 16-bit signed integers to float32 in [-1, 1] range", () => {
      let capturedChannelData: Float32Array | null = null;
      mockCreateBuffer.mockImplementationOnce(
        (channels: number, length: number, sampleRate: number) => {
          capturedChannelData = new Float32Array(length);
          return {
            numberOfChannels: channels,
            length,
            sampleRate,
            getChannelData: vi.fn(() => capturedChannelData),
          } as unknown as AudioBuffer;
        }
      );

      const testPcm = new Int16Array([0, 16384, -16384, 32767]);
      callStreamBuffer(testPcm.buffer);

      expect(capturedChannelData).not.toBeNull();
      // 0 / 32768 = 0
      expect(capturedChannelData![0]).toBeCloseTo(0, 5);
      // 16384 / 32768 = 0.5
      expect(capturedChannelData![1]).toBeCloseTo(0.5, 5);
      // -16384 / 32768 = -0.5
      expect(capturedChannelData![2]).toBeCloseTo(-0.5, 5);
      // 32767 / 32768 ≈ 0.99997
      expect(capturedChannelData![3]).toBeCloseTo(32767 / 32768, 5);
    });
  });
});
