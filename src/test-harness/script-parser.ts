// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { parse, Document, YAMLMap, YAMLSeq, YAMLParseError } from "yaml";
import type { TestScript, ParseResult } from "./script-types";

/**
 * Parse a YAML string into a validated TestScript.
 * Returns a discriminated union: { ok: true, script } or { ok: false, error }.
 */
export function parseTestScript(yamlText: string): ParseResult {
  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (err) {
    if (err instanceof YAMLParseError) {
      const line = err.linePos?.[0]?.line;
      return {
        ok: false,
        error: {
          type: "syntax",
          message: err.message,
          line,
        },
      };
    }
    return {
      ok: false,
      error: {
        type: "syntax",
        message: String(err),
      },
    };
  }

  return validateTestScript(raw);
}

/**
 * Format a TestScript object back to YAML string.
 * The `variations` array (when present) is serialised inline (flow style)
 * so the output remains compact and readable, e.g.:
 *   variations: ["Can I get an update?", "Where is my order?"]
 */
export function formatTestScript(script: TestScript): string {
  // Build a YAML Document manually so we can apply flow style to each
  // variations array while keeping the rest in block style.
  const doc = new Document();

  const rootMap = doc.createNode(script) as YAMLMap;

  // Walk each turn and convert the `variations` node to flow style
  const turnsSeq = rootMap.get("turns", true) as YAMLSeq | undefined;
  if (turnsSeq) {
    for (const turnNode of turnsSeq.items) {
      const turnMap = turnNode as YAMLMap;
      const varsNode = turnMap.get("variations", true) as YAMLSeq | undefined;
      if (varsNode && varsNode instanceof YAMLSeq) {
        varsNode.flow = true;
      }
    }
  }

  doc.contents = rootMap;
  return doc.toString();
}

/**
 * Validate a TestScript object (post-parse structural validation).
 * Checks name length, turns count, and individual turn content.
 */
export function validateTestScript(raw: unknown): ParseResult {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "Script name is required",
      },
    };
  }

  const obj = raw as Record<string, unknown>;

  // Validate name
  if (!obj.name || (typeof obj.name === "string" && obj.name.trim() === "")) {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "Script name is required",
      },
    };
  }

  if (typeof obj.name !== "string") {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "Script name is required",
      },
    };
  }

  if (obj.name.length > 200) {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "Script name must be 200 characters or fewer",
      },
    };
  }

  // Validate turns
  if (!obj.turns || !Array.isArray(obj.turns) || obj.turns.length === 0) {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "At least one turn is required",
      },
    };
  }

  if (obj.turns.length > 50) {
    return {
      ok: false,
      error: {
        type: "validation",
        message: "Maximum 50 turns allowed",
      },
    };
  }

  // Validate each turn
  for (let i = 0; i < obj.turns.length; i++) {
    const turn = obj.turns[i];

    if (
      turn === null ||
      turn === undefined ||
      typeof turn !== "object" ||
      !("customer" in turn)
    ) {
      return {
        ok: false,
        error: {
          type: "validation",
          message: `Turn ${i} has an empty or missing customer utterance`,
          turnIndex: i,
        },
      };
    }

    const customer = (turn as Record<string, unknown>).customer;

    if (
      typeof customer !== "string" ||
      customer.trim() === ""
    ) {
      return {
        ok: false,
        error: {
          type: "validation",
          message: `Turn ${i} has an empty or missing customer utterance`,
          turnIndex: i,
        },
      };
    }

    if (customer.length > 1024) {
      return {
        ok: false,
        error: {
          type: "validation",
          message: `Turn ${i} customer utterance exceeds 1024 characters`,
          turnIndex: i,
        },
      };
    }

    // Validate expectedResponses if present
    const turnObj = turn as Record<string, unknown>;
    if ("expectedResponses" in turnObj && turnObj.expectedResponses !== undefined) {
      const er = turnObj.expectedResponses;
      if (typeof er !== "number" || !Number.isInteger(er) || er < 1 || er > 10) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `Turn ${i} expectedResponses must be an integer between 1 and 10`,
            turnIndex: i,
          },
        };
      }
    }

    // Validate variations if present
    if ("variations" in turnObj && turnObj.variations !== undefined) {
      const vars = turnObj.variations;

      if (!Array.isArray(vars)) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `Turn ${i} variations must be an array`,
            turnIndex: i,
          },
        };
      }

      if (vars.length === 0) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `Turn ${i} variations array must not be empty`,
            turnIndex: i,
          },
        };
      }

      if (vars.length > 50) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `Turn ${i} variations array exceeds 50 items`,
            turnIndex: i,
          },
        };
      }

      for (let j = 0; j < vars.length; j++) {
        const item = vars[j];
        if (typeof item !== "string" || item.trim() === "") {
          return {
            ok: false,
            error: {
              type: "validation",
              message: `Turn ${i} variation ${j} must be a non-empty string`,
              turnIndex: i,
            },
          };
        }
        if (item.length > 1024) {
          return {
            ok: false,
            error: {
              type: "validation",
              message: `Turn ${i} variation ${j} exceeds 1024 characters`,
              turnIndex: i,
            },
          };
        }
      }
    }
  }

  // Build the validated TestScript
  const script: TestScript = {
    name: obj.name,
    turns: (obj.turns as Array<{ customer: string; expectedResponses?: number; variations?: string[] }>).map((t) => ({
      customer: t.customer,
      ...(t.expectedResponses !== undefined && { expectedResponses: t.expectedResponses }),
      ...(t.variations !== undefined && { variations: t.variations }),
    })),
  };

  return { ok: true, script };
}
