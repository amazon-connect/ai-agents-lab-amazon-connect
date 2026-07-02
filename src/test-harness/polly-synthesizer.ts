// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  PollyClient,
  DescribeVoicesCommand,
  SynthesizeSpeechCommand,
  type Engine,
  type VoiceId,
} from "@aws-sdk/client-polly";
import type { AWSCredentials } from "../credentials/types";
import type {
  PollyVoice,
  SynthesizeParams,
  SynthesisResult,
  SynthesisProgress,
} from "./voice-types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum character length for a single Polly utterance. */
const MAX_UTTERANCE_LENGTH = 3000;

/** Timeout for a single SynthesizeSpeech call (ms). */
const SYNTHESIS_TIMEOUT_MS = 10_000;

/** Region that supports generative voices. */
const GENERATIVE_REGION = "us-east-1";

/** Default voice ID for synthesis. */
const DEFAULT_VOICE_ID = "Ruth";

/** Default engine for synthesis. */
const DEFAULT_ENGINE = "generative";

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that all utterances are within the 3000-character limit.
 * Returns the index of the first invalid utterance, or -1 if all are valid.
 */
export function validateUtteranceLengths(utterances: string[]): number {
  for (let i = 0; i < utterances.length; i++) {
    const utterance = utterances[i]!;
    if (utterance.length > MAX_UTTERANCE_LENGTH) {
      return i;
    }
  }
  return -1;
}

// ─── Voice Discovery ─────────────────────────────────────────────────────────

/**
 * Fetch available Polly voices for the given engine.
 * Calls DescribeVoices with Engine=generative (preferred) or Engine=neural (fallback).
 * Tries generative-supported regions (us-east-1 first) to maximize availability.
 * Returns voices grouped by language.
 */
export async function fetchAvailableVoices(params: {
  credentials: AWSCredentials;
  signal?: AbortSignal;
}): Promise<PollyVoice[]> {
  const { credentials, signal } = params;

  const pollyClient = new PollyClient({
    region: GENERATIVE_REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Try generative engine first
  try {
    const voices = await describeVoicesForEngine(pollyClient, "generative", signal);
    if (voices.length > 0) {
      return voices;
    }
  } catch {
    // Fall through to neural fallback
  }

  // Fallback to neural engine
  const voices = await describeVoicesForEngine(pollyClient, "neural", signal);
  return voices;
}

/**
 * Call DescribeVoices for a specific engine and map results to PollyVoice[].
 */
async function describeVoicesForEngine(
  client: PollyClient,
  engine: Engine,
  signal?: AbortSignal
): Promise<PollyVoice[]> {
  const response = await withRetry(
    () =>
      client.send(
        new DescribeVoicesCommand({ Engine: engine }),
        signal ? { abortSignal: signal } : undefined
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const voices: PollyVoice[] = (response.Voices ?? []).map((v) => ({
    voiceId: v.Id ?? "",
    name: v.Name ?? "",
    gender: (v.Gender === "Male" ? "Male" : "Female") as "Female" | "Male",
    languageCode: v.LanguageCode ?? "",
    languageName: v.LanguageName ?? "",
    engine: engine as "generative" | "neural" | "standard",
  }));

  return voices;
}

// ─── Audio Synthesis ─────────────────────────────────────────────────────────

/**
 * Pre-generate PCM audio buffers for all utterances using Amazon Polly.
 * Calls SynthesizeSpeech sequentially with:
 *   Engine=generative, VoiceId=Ruth, OutputFormat=pcm, SampleRate=16000.
 * Uses the generative engine for highest quality, most natural-sounding speech.
 * Each call has a 10-second timeout.
 */
export async function synthesizeAll(
  params: SynthesizeParams
): Promise<SynthesisResult> {
  const {
    utterances,
    credentials,
    region: _region,
    voiceId = DEFAULT_VOICE_ID,
    engine = DEFAULT_ENGINE,
    signal,
    onProgress,
  } = params;

  // Validate utterance lengths before calling Polly
  const invalidIndex = validateUtteranceLengths(utterances);
  if (invalidIndex !== -1) {
    throw new Error(
      `Utterance at index ${invalidIndex} exceeds the ${MAX_UTTERANCE_LENGTH}-character limit`
    );
  }

  // Use us-east-1 for generative voices regardless of Connect instance region
  const synthesisRegion = engine === "generative" ? GENERATIVE_REGION : _region;

  const pollyClient = new PollyClient({
    region: synthesisRegion,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const buffers: ArrayBuffer[] = [];

  for (let i = 0; i < utterances.length; i++) {
    // Check for cancellation before each call
    if (signal?.aborted) {
      throw new Error("Synthesis aborted by user");
    }

    // Report progress
    if (onProgress) {
      const progress: SynthesisProgress = {
        currentIndex: i,
        totalCount: utterances.length,
      };
      onProgress(progress);
    }

    const buffer = await synthesizeUtterance(
      pollyClient,
      utterances[i]!,
      voiceId,
      engine,
      signal
    );
    buffers.push(buffer);
  }

  return { buffers };
}

// ─── Utterance Map Synthesis ─────────────────────────────────────────────────

/** Parameters for synthesizing a set of utterances into a keyed map. */
export interface SynthesizeMapParams {
  /** Deduplicated list of utterance strings to synthesize. */
  utterances: string[];
  credentials: AWSCredentials;
  region: string;
  voiceId?: string;
  engine?: "generative" | "neural" | "standard";
  signal?: AbortSignal;
  onProgress?: (progress: SynthesisProgress) => void;
}

/**
 * Synthesize a set of utterances and return a Map keyed by utterance string.
 * Each unique utterance is synthesized exactly once regardless of duplicates.
 * Reuses the existing `validateUtteranceLengths` guard before calling Polly.
 */
export async function synthesizeUtteranceMap(
  params: SynthesizeMapParams
): Promise<Map<string, ArrayBuffer>> {
  const {
    utterances,
    credentials,
    region: _region,
    voiceId = DEFAULT_VOICE_ID,
    engine = DEFAULT_ENGINE,
    signal,
    onProgress,
  } = params;

  // Validate utterance lengths before calling Polly
  const invalidIndex = validateUtteranceLengths(utterances);
  if (invalidIndex !== -1) {
    throw new Error(
      `Utterance at index ${invalidIndex} exceeds the ${MAX_UTTERANCE_LENGTH}-character limit`
    );
  }

  // Use us-east-1 for generative voices regardless of Connect instance region
  const synthesisRegion = engine === "generative" ? GENERATIVE_REGION : _region;

  const pollyClient = new PollyClient({
    region: synthesisRegion,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const result = new Map<string, ArrayBuffer>();

  for (let i = 0; i < utterances.length; i++) {
    // Check for cancellation before each call
    if (signal?.aborted) {
      throw new Error("Synthesis aborted by user");
    }

    // Report progress
    if (onProgress) {
      const progress: SynthesisProgress = {
        currentIndex: i,
        totalCount: utterances.length,
      };
      onProgress(progress);
    }

    const utterance = utterances[i]!;
    const buffer = await synthesizeUtterance(
      pollyClient,
      utterance,
      voiceId,
      engine,
      signal
    );
    result.set(utterance, buffer);
  }

  return result;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Synthesize a single utterance with a 10-second timeout.
 * Returns the raw PCM audio buffer.
 */
async function synthesizeUtterance(
  client: PollyClient,
  text: string,
  voiceId: string,
  engine: Engine,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  // Create a timeout abort controller that composes with the user signal
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort();
  }, SYNTHESIS_TIMEOUT_MS);

  // If the user signal aborts, also abort the timeout controller
  const onUserAbort = () => timeoutController.abort();
  if (signal) {
    signal.addEventListener("abort", onUserAbort, { once: true });
  }

  try {
    const response = await withRetry(
      () =>
        client.send(
          new SynthesizeSpeechCommand({
            Text: text,
            VoiceId: voiceId as VoiceId,
            Engine: engine,
            OutputFormat: "pcm",
            SampleRate: "16000",
          }),
          { abortSignal: timeoutController.signal }
        ),
      DEFAULT_RETRY_CONFIG,
      timeoutController.signal
    );

    // Read the audio stream into an ArrayBuffer
    const audioStream = response.AudioStream;
    if (!audioStream) {
      throw new Error("SynthesizeSpeech returned no audio stream");
    }

    // In AWS SDK v3 browser builds, AudioStream is a ReadableStream or Blob-like
    // Handle both cases for compatibility
    if (audioStream instanceof Blob) {
      return await audioStream.arrayBuffer();
    }

    // ReadableStream path (standard browser environment)
    const reader = (audioStream as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    // Concatenate chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw new Error("SynthesizeSpeech timed out after 10 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener("abort", onUserAbort);
    }
  }
}
