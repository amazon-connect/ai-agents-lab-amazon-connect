// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { AWSCredentials } from "../credentials/types";
import type { TestScript } from "./script-types";
import { formatTestScript, parseTestScript } from "./script-parser";

// ─── Constants ───────────────────────────────────────────────────────────────

import { getStoredVariationModelId } from "../settings/SettingsPage";

/**
 * Max tokens for the response. A script with 20 turns × 10 variations each
 * at ~20 tokens/variation ≈ 4000 tokens; 8192 gives comfortable headroom.
 */
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT =
  "You are a test data generator for a contact centre conversational AI agent. " +
  "You will receive a YAML test script that describes a multi-turn conversation " +
  "between a customer and an AI agent. Each turn has a `customer` field containing " +
  "the customer's utterance. Your job is to add a `variations` array to every turn " +
  "containing natural, realistic paraphrases of that utterance. " +
  "Paraphrases must preserve the original intent and information content while " +
  "reflecting the linguistic variation real users exhibit: different word choices, " +
  "sentence structures, levels of formality, and degrees of directness. " +
  "Use the full conversation context to generate coherent variations — for example, " +
  "if a turn refers to a previous answer, the variations should preserve that reference. " +
  "Do not add information not present in the original utterance. " +
  "Return only the complete updated YAML with no explanation, markdown fences, or wrapper text.";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface GenerateVariationsParams {
  script: TestScript;
  variationCount: number; // 1–20
  temperature: number;    // 0.0–1.0
  credentials: AWSCredentials;
  region: string;
  signal: AbortSignal;
  onProgress?: (turnIndex: number, totalTurns: number) => void;
}

export interface GenerateVariationsResult {
  /** Updated script with variations populated (pre-existing ones are replaced). */
  script: TestScript;
  /** Number of turns that received at least one variation. */
  turnsGenerated: number;
  /** Total number of variation strings generated across all turns. */
  totalVariations: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Try to extract valid YAML from the model response.
 * Handles the case where the model wraps output in ```yaml ... ``` fences
 * despite being told not to.
 */
function extractYaml(text: string): string {
  const fenced = text.match(/```(?:yaml)?\s*\n([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Generate paraphrase variations for all turns in a script with a single
 * Bedrock call. The full YAML is sent as context so the model can produce
 * coherent, conversation-aware paraphrases for each turn.
 */
export async function generateVariations(
  params: GenerateVariationsParams
): Promise<GenerateVariationsResult> {
  const {
    script,
    variationCount,
    temperature,
    credentials,
    region,
    signal,
    onProgress,
  } = params;

  const modelId = getStoredVariationModelId();

  const client = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Serialise the script to YAML (strips any existing variations so the
  // model starts clean and doesn't try to preserve stale data).
  const scriptWithoutVariations: TestScript = {
    ...script,
    turns: script.turns.map(({ variations: _v, ...rest }) => rest),
  };
  const scriptYaml = formatTestScript(scriptWithoutVariations);

  const userMessage =
    `Add exactly ${variationCount} variations to each customer turn in the following YAML test script. ` +
    `Each variation must be a natural paraphrase of the customer utterance for that turn, ` +
    `informed by the full conversation context. ` +
    `Return only the complete updated YAML.\n\n${scriptYaml}`;

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    temperature,
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(requestBody),
  });

  const response = await client.send(command, { abortSignal: signal });
  const responseBody = new TextDecoder().decode(response.body);

  const envelope = JSON.parse(responseBody) as {
    content: { text: string }[];
  };
  const rawText = envelope.content[0]?.text ?? "";
  const yamlText = extractYaml(rawText);

  // Parse and validate the returned YAML.
  // On failure, return the original script unmodified (safe fallback).
  const parsed = parseTestScript(yamlText);
  if (!parsed.ok) {
    return { script, turnsGenerated: 0, totalVariations: 0 };
  }

  const updatedScript = parsed.script;

  // Tally results and report progress
  let turnsGenerated = 0;
  let totalVariations = 0;
  for (let i = 0; i < updatedScript.turns.length; i++) {
    const vars = updatedScript.turns[i]?.variations;
    if (vars && vars.length > 0) {
      turnsGenerated++;
      totalVariations += vars.length;
    }
    onProgress?.(i, updatedScript.turns.length);
  }

  return { script: updatedScript, turnsGenerated, totalVariations };
}
