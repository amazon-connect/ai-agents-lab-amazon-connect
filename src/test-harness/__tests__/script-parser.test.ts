// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { parseTestScript, formatTestScript } from "../script-parser";

// ---------------------------------------------------------------------------
// parseTestScript — happy paths
// ---------------------------------------------------------------------------

describe("parseTestScript — happy paths", () => {
  it("parses a minimal valid script", () => {
    const yaml = `
name: Simple script
turns:
  - customer: Hello
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.name).toBe("Simple script");
      expect(result.script.turns).toHaveLength(1);
      expect(result.script.turns[0]!.customer).toBe("Hello");
      expect(result.script.turns[0]!.variations).toBeUndefined();
    }
  });

  it("parses a script with valid variations", () => {
    const yaml = `
name: Variations script
turns:
  - customer: I want to check my order
    variations:
      - Can I get an update on my order?
      - Where is my order?
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.turns[0]!.variations).toEqual([
        "Can I get an update on my order?",
        "Where is my order?",
      ]);
    }
  });

  it("leaves variations undefined when not present", () => {
    const yaml = `
name: No variations
turns:
  - customer: Hello
  - customer: Goodbye
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.turns[0]!.variations).toBeUndefined();
      expect(result.script.turns[1]!.variations).toBeUndefined();
    }
  });

  it("accepts one variation per turn (minimum)", () => {
    const yaml = `
name: One variation
turns:
  - customer: Hello
    variations:
      - Hi there
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.turns[0]!.variations).toEqual(["Hi there"]);
    }
  });

  it("accepts exactly 50 variations", () => {
    const variations = Array.from({ length: 50 }, (_, i) => `variation ${i + 1}`);
    const variationsYaml = variations.map((v) => `      - "${v}"`).join("\n");
    const yaml = `name: Max variations\nturns:\n  - customer: Hello\n    variations:\n${variationsYaml}`;
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.turns[0]!.variations).toHaveLength(50);
    }
  });
});

// ---------------------------------------------------------------------------
// parseTestScript — variations validation errors
// ---------------------------------------------------------------------------

describe("parseTestScript — variations validation errors", () => {
  it("rejects variations that is not an array (string)", () => {
    const yaml = `
name: Bad variations
turns:
  - customer: Hello
    variations: "not an array"
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
      expect(result.error.message).toMatch(/variations must be an array/i);
    }
  });

  it("rejects variations that is not an array (object)", () => {
    const yaml = `
name: Bad variations
turns:
  - customer: Hello
    variations:
      key: value
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
    }
  });

  it("rejects an empty variations array", () => {
    const yaml = `
name: Empty variations
turns:
  - customer: Hello
    variations: []
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
      expect(result.error.message).toMatch(/must not be empty/i);
    }
  });

  it("rejects variations array with more than 50 items", () => {
    const variations = Array.from({ length: 51 }, (_, i) => `variation ${i + 1}`);
    const variationsYaml = variations.map((v) => `      - "${v}"`).join("\n");
    const yaml = `name: Too many\nturns:\n  - customer: Hello\n    variations:\n${variationsYaml}`;
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
      expect(result.error.message).toMatch(/exceeds 50 items/i);
    }
  });

  it("rejects an empty string variation item", () => {
    const yaml = `
name: Empty item
turns:
  - customer: Hello
    variations:
      - ""
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
      expect(result.error.message).toMatch(/non-empty string/i);
    }
  });

  it("rejects a whitespace-only variation item", () => {
    const yaml = `
name: Whitespace item
turns:
  - customer: Hello
    variations:
      - "   "
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
      expect(result.error.message).toMatch(/non-empty string/i);
    }
  });

  it("rejects a variation item exceeding 1024 characters", () => {
    const longString = "a".repeat(1025);
    const yaml = `
name: Long item
turns:
  - customer: Hello
    variations:
      - "${longString}"
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(0);
      expect(result.error.message).toMatch(/exceeds 1024 characters/i);
    }
  });

  it("accepts a variation item of exactly 1024 characters", () => {
    const maxString = "a".repeat(1024);
    const yaml = `name: Max item\nturns:\n  - customer: Hello\n    variations:\n      - "${maxString}"`;
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(true);
  });

  it("reports the correct turn index for variations errors on a later turn", () => {
    const yaml = `
name: Multi-turn
turns:
  - customer: Hello
  - customer: World
    variations: []
`.trim();
    const result = parseTestScript(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.turnIndex).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// formatTestScript — inline variations (Requirement 1.6)
// ---------------------------------------------------------------------------

describe("formatTestScript — variations serialisation", () => {
  it("serialises variations inline (flow style) in YAML output", () => {
    const script = {
      name: "Round-trip",
      turns: [
        {
          customer: "I want to check my order",
          variations: ["Can I get an update?", "Where is my order?"],
        },
      ],
    };
    const yaml = formatTestScript(script);
    // variations should appear inline, e.g.: variations: ["Can I get an update?", "Where is my order?"]
    expect(yaml).toContain("variations:");
    // The array items should be on the SAME line as variations (flow/inline style)
    const variationsLine = yaml
      .split("\n")
      .find((line) => line.includes("variations:"));
    expect(variationsLine).toBeDefined();
    // Flow style: both items on the same line as variations key
    expect(variationsLine).toContain("Can I get an update?");
    expect(variationsLine).toContain("Where is my order?");
  });

  it("round-trips a script with variations correctly", () => {
    const script = {
      name: "Round-trip",
      turns: [
        {
          customer: "I want to check my order",
          variations: ["Can I get an update?", "Where is my order?"],
          expectedResponses: 1,
        },
        {
          customer: "Order number 12345",
          // no variations
        },
      ],
    };
    const yaml = formatTestScript(script);
    const reparsed = parseTestScript(yaml);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.script.name).toBe("Round-trip");
      expect(reparsed.script.turns[0]!.variations).toEqual([
        "Can I get an update?",
        "Where is my order?",
      ]);
      expect(reparsed.script.turns[1]!.variations).toBeUndefined();
    }
  });

  it("omits variations key when not present", () => {
    const script = {
      name: "No vars",
      turns: [{ customer: "Hello" }],
    };
    const yaml = formatTestScript(script);
    // Should not contain a "variations:" key
    expect(yaml).not.toMatch(/^\s*variations:/m);
  });
});
