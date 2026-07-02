// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export interface InvokeBedrockParams {
  systemPrompt: string;
  userMessage: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
  region: string;
  signal?: AbortSignal;
}

// Default model uses the US cross-region inference profile.
// Users in other regions should override this via Settings → Evaluation Model.
const DEFAULT_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function getModelId(): string {
  const stored = localStorage.getItem("evaluation-model-id");
  return stored || DEFAULT_MODEL_ID;
}

// ─── Client Cache ────────────────────────────────────────────────────────────
// Reuse the same BedrockRuntimeClient for identical region + credentials,
// avoiding unnecessary allocations during sequential evaluation runs.

let cachedClient: BedrockRuntimeClient | null = null;
let cachedClientKey = "";

function getOrCreateClient(
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string }
): BedrockRuntimeClient {
  const key = `${region}:${credentials.accessKeyId}:${credentials.sessionToken}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClient = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
  cachedClientKey = key;
  return cachedClient;
}

function isThrottlingError(error: unknown): boolean {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name: string }).name;
    return name === "ThrottlingException" || name === "TooManyRequestsException";
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Invoke Bedrock InvokeModel with the Anthropic Messages API format.
 * Reads model ID from localStorage ("evaluation-model-id"),
 * defaulting to "us.anthropic.claude-haiku-4-5-20251001-v1:0".
 * Retries throttling errors with exponential backoff (1s base, 3 retries).
 */
export async function invokeBedrock(params: InvokeBedrockParams): Promise<string> {
  const { systemPrompt, userMessage, credentials, region, signal } = params;

  const modelId = getModelId();

  const client = getOrCreateClient(region, credentials);

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(requestBody),
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    try {
      const response = await client.send(command, { abortSignal: signal });
      const responseBody = new TextDecoder().decode(response.body);
      const parsed = JSON.parse(responseBody) as { content: { text: string }[]; stop_reason?: string };
      const text = parsed.content[0]?.text;
      if (text === undefined) {
        throw new Error("Bedrock response missing content[0].text");
      }
      if (parsed.stop_reason === "max_tokens") {
        throw new Error("Response truncated (max_tokens reached). The generated content was too long. Try with a simpler conversation or a more capable model.");
      }
      return text;
    } catch (error: unknown) {
      if (!isThrottlingError(error)) {
        throw error;
      }

      // If we've exhausted all retries, throw the throttling error
      if (attempt === MAX_RETRIES) {
        throw error;
      }

      // Exponential backoff: 1000ms, 2000ms, 4000ms
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay, signal);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error("Unexpected: exhausted retry loop");
}
