// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ChatMessage } from "../test-harness/chat-client";

/**
 * Strip markdown code fences from LLM response.
 * Handles multiple patterns:
 * 1. Entire response is a fenced block: ```json\n...\n```
 * 2. Response has preamble text before a fenced block
 * 3. Response starts with a JSON object but has trailing text
 * 4. Response has no fences (returned as-is after trim)
 * Must be idempotent: applying twice gives the same result as applying once.
 */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();

  // Pattern 1: Entire response is wrapped in fences (anchored)
  const fullWrapPattern = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const fullMatch = trimmed.match(fullWrapPattern);
  if (fullMatch && fullMatch[1] !== undefined) {
    return fullMatch[1].trim();
  }

  // Pattern 2: Response contains a fenced block somewhere (extract the first one)
  const embeddedPattern = /```(?:\w+)?\s*\n([\s\S]*?)\n\s*```/;
  const embeddedMatch = trimmed.match(embeddedPattern);
  if (embeddedMatch && embeddedMatch[1] !== undefined) {
    return embeddedMatch[1].trim();
  }

  // Pattern 3: If the trimmed result doesn't start with '{', try to find the JSON object
  // This handles cases where the LLM adds preamble text without fences
  if (!trimmed.startsWith("{")) {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
  }

  return trimmed;
}

/**
 * Walk a JSON structure and replace all "RefId" field values with crypto.randomUUID().
 * All non-RefId fields are preserved unchanged.
 * All generated UUIDs are unique (crypto.randomUUID guarantees uniqueness).
 */
export function replaceRefIds(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => replaceRefIds(item));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "RefId") {
        result[key] = crypto.randomUUID();
      } else {
        result[key] = replaceRefIds(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Validate the basic structure of a form JSON.
 * Returns null if valid, or an error message string.
 *
 * Validation rules:
 * - Title: required, non-empty string
 * - Description: required, non-empty string
 * - Items: required, non-empty array
 * - Each section: Title, RefId, Items (non-empty array) required
 * - Each question: Title, RefId, QuestionType required
 * - Each option: RefId, Text, Score required
 */
export function validateFormStructure(json: unknown): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return "Form must be a JSON object";
  }

  const form = json as Record<string, unknown>;

  // Validate Title
  if (!form.Title || typeof form.Title !== "string" || form.Title.trim() === "") {
    return "Title is required and must be a non-empty string";
  }

  // Validate Description
  if (!form.Description || typeof form.Description !== "string" || form.Description.trim() === "") {
    return "Description is required and must be a non-empty string";
  }

  // Validate Items
  if (!Array.isArray(form.Items) || form.Items.length === 0) {
    return "Items is required and must be a non-empty array";
  }

  // Validate each section
  for (let i = 0; i < form.Items.length; i++) {
    const item = form.Items[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") {
      return `Items[${i}] must be an object`;
    }

    const section = item.Section as Record<string, unknown> | undefined;
    if (!section || typeof section !== "object") {
      return `Items[${i}].Section is required`;
    }

    if (!section.Title || typeof section.Title !== "string" || (section.Title as string).trim() === "") {
      return `Items[${i}].Section.Title is required and must be a non-empty string`;
    }

    if (!section.RefId || typeof section.RefId !== "string") {
      return `Items[${i}].Section.RefId is required`;
    }

    if (!Array.isArray(section.Items) || section.Items.length === 0) {
      return `Items[${i}].Section.Items is required and must be a non-empty array`;
    }

    // Validate each question in the section
    for (let j = 0; j < section.Items.length; j++) {
      const questionItem = section.Items[j] as Record<string, unknown> | undefined;
      if (!questionItem || typeof questionItem !== "object") {
        return `Items[${i}].Section.Items[${j}] must be an object`;
      }

      const question = questionItem.Question as Record<string, unknown> | undefined;
      if (!question || typeof question !== "object") {
        return `Items[${i}].Section.Items[${j}].Question is required`;
      }

      if (!question.Title || typeof question.Title !== "string" || (question.Title as string).trim() === "") {
        return `Items[${i}].Section.Items[${j}].Question.Title is required`;
      }

      if (!question.RefId || typeof question.RefId !== "string") {
        return `Items[${i}].Section.Items[${j}].Question.RefId is required`;
      }

      if (!question.QuestionType || typeof question.QuestionType !== "string") {
        return `Items[${i}].Section.Items[${j}].Question.QuestionType is required`;
      }

      // Validate options if QuestionTypeProperties.SingleSelect.Options exists
      const questionTypeProps = question.QuestionTypeProperties as Record<string, unknown> | undefined;
      if (questionTypeProps && typeof questionTypeProps === "object") {
        const singleSelect = questionTypeProps.SingleSelect as Record<string, unknown> | undefined;
        if (singleSelect && typeof singleSelect === "object") {
          const options = singleSelect.Options as unknown[];
          if (Array.isArray(options)) {
            for (let k = 0; k < options.length; k++) {
              const option = options[k] as Record<string, unknown> | undefined;
              if (!option || typeof option !== "object") {
                return `Items[${i}].Section.Items[${j}].Question options[${k}] must be an object`;
              }
              if (!option.RefId || typeof option.RefId !== "string") {
                return `Items[${i}].Section.Items[${j}].Question options[${k}].RefId is required`;
              }
              if (!option.Text || typeof option.Text !== "string") {
                return `Items[${i}].Section.Items[${j}].Question options[${k}].Text is required`;
              }
              if (option.Score === undefined || option.Score === null || typeof option.Score !== "number") {
                return `Items[${i}].Section.Items[${j}].Question options[${k}].Score is required`;
              }
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Format chat messages into numbered transcript for the LLM.
 * - Each turn numbered sequentially starting from 0
 * - Customer messages prefixed with "CUSTOMER:"
 * - Agent messages prefixed with "AGENT:"
 * - System messages excluded from output
 * - Pair consecutive customer and agent messages into the same turn number
 */
export function formatTranscript(messages: ChatMessage[]): string {
  // Filter out system messages
  const filtered = messages.filter((m) => m.role !== "system");

  if (filtered.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let turnNumber = 0;
  let i = 0;

  while (i < filtered.length) {
    const message = filtered[i]!;

    if (message.role === "customer") {
      lines.push(`${turnNumber} CUSTOMER: ${message.content}`);

      // Check if next message is an agent message to pair
      const nextMessage = filtered[i + 1];
      if (i + 1 < filtered.length && nextMessage && nextMessage.role === "agent") {
        lines.push(`${turnNumber} AGENT: ${nextMessage.content}`);
        i += 2;
      } else {
        i += 1;
      }
      turnNumber++;
    } else if (message.role === "agent") {
      // Agent message without a preceding customer message in this turn
      lines.push(`${turnNumber} AGENT: ${message.content}`);
      i += 1;
      turnNumber++;
    } else {
      i += 1;
    }
  }

  return lines.join("\n");
}
