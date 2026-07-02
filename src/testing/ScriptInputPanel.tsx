// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useRef, useEffect } from "react";

import CodeTextarea from "../components/CodeTextarea";
import type { StatusBarState } from "../components/CodeTextarea";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import type { SelectProps } from "@cloudscape-design/components/select";
import Slider from "@cloudscape-design/components/slider";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Toggle from "@cloudscape-design/components/toggle";

import Popover from "@cloudscape-design/components/popover";
import { HelpIcon } from "../contextual-help";
import { parseTestScript } from "../test-harness/script-parser";
import { validateBatchConfig } from "../test-harness/batch-validation";
import type {
  TestScript,
  ScriptProgress,
  TerminationReason,
} from "../test-harness/script-types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ScriptInputPanelProps {
  /** Called with a validated TestScript when the user clicks "Run Script" */
  onRunScript: (script: TestScript) => void;
  /** Called when the user clicks "Run Batch" with validated batch parameters and parsed script */
  onRunBatch?: (script: TestScript, iterationCount: number, concurrency: number) => void;
  /** Called when the user clicks "Stop" during execution */
  onStop: () => void;
  /** Whether a single script is currently executing */
  isRunning: boolean;
  /** Whether a batch is currently executing (shows Stop button, locks controls) */
  isBatchExecuting?: boolean;
  /** Progress update during execution (current turn / total) */
  progress: ScriptProgress | null;
  /** Summary shown after execution completes */
  completionSummary: {
    terminationReason: TerminationReason;
    totalDurationMs: number;
    synthesisDurationMs?: number;
  } | null;
  /** Whether an agent is currently selected */
  hasAgent: boolean;
  /** Whether infrastructure is not ready (disables all controls) */
  disabled?: boolean;
  /** Whether a batch is currently running — disables batch toggle and config inputs */
  batchActive?: boolean;

  // ── Variation props (lifted to TestingPage) ────────────────────────────────
  /** Whether variation generation is currently in progress */
  isGenerating: boolean;
  /** Called when the user clicks "Generate variations" */
  onGenerateVariations: (count: number, temperature: number) => void;
  /** Called when the user clicks "Cancel" during generation */
  onCancelGeneration: () => void;
  /** Called when the user clicks "Export enriched script" */
  onExportEnrichedScript: () => void;
  /** Summary of the last completed generation run */
  generationSummary: { turnsGenerated: number; totalVariations: number } | null;
  /** The currently parsed script (needed to check if variations exist) */
  parsedScript: TestScript | null;
  /** Called whenever the textarea contains a valid parsed script (or null when invalid/empty) */
  onParsedScriptChange?: (script: TestScript | null) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_CHARS = 50_000;

const LOCAL_STORAGE_VARIATION_COUNT = "variation-count";
const LOCAL_STORAGE_TEMPERATURE = "variation-temperature";

const DEFAULT_VARIATION_COUNT = 5;
const DEFAULT_TEMPERATURE = 0.5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readLocalStorageNumber(key: string, defaultValue: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    const parsed = Number(raw);
    return isFinite(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Build variation count select options (1–20)
const VARIATION_COUNT_OPTIONS: SelectProps.Option[] = Array.from(
  { length: 20 },
  (_, i) => ({ value: String(i + 1), label: String(i + 1) })
);

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * YAML script input panel with validation, execution controls, and progress display.
 * Manages its own textarea value and validation state internally.
 */
export default function ScriptInputPanel({
  onRunScript,
  onRunBatch,
  onStop,
  isRunning,
  isBatchExecuting = false,
  progress: _progress,
  completionSummary,
  hasAgent,
  disabled = false,
  batchActive = false,
  isGenerating,
  onGenerateVariations,
  onCancelGeneration,
  onExportEnrichedScript,
  generationSummary,
  parsedScript,
  onParsedScriptChange,
}: ScriptInputPanelProps) {
  const [yamlText, setYamlText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Batch configuration state
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [iterationCount, setIterationCount] = useState("10");
  const [concurrency, setConcurrency] = useState("3");
  const [iterationCountError, setIterationCountError] = useState<string | undefined>(undefined);
  const [concurrencyError, setConcurrencyError] = useState<string | undefined>(undefined);

  // ── Variation local state with localStorage persistence ───────────────────
  const [variationCount, setVariationCount] = useState<number>(() =>
    readLocalStorageNumber(LOCAL_STORAGE_VARIATION_COUNT, DEFAULT_VARIATION_COUNT)
  );
  const [temperature, setTemperature] = useState<number>(() =>
    readLocalStorageNumber(LOCAL_STORAGE_TEMPERATURE, DEFAULT_TEMPERATURE)
  );

  const handleVariationCountChange = useCallback(
    ({ detail }: { detail: SelectProps.ChangeDetail }) => {
      const value = Number(detail.selectedOption.value);
      setVariationCount(value);
      try {
        localStorage.setItem(LOCAL_STORAGE_VARIATION_COUNT, String(value));
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const handleTemperatureChange = useCallback(
    ({ detail }: { detail: { value: number } }) => {
      setTemperature(detail.value);
      try {
        localStorage.setItem(LOCAL_STORAGE_TEMPERATURE, String(detail.value));
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  // Listen for script-import events (from "Save as Script" in manual mode)
  useEffect(() => {
    const handler = (e: Event) => {
      const yaml = (e as CustomEvent<string>).detail;
      setYamlText(yaml);
      setValidationError(null);
    };
    window.addEventListener("script-import", handler);
    return () => window.removeEventListener("script-import", handler);
  }, []);

  // Notify parent of the current parsed script whenever yamlText changes
  useEffect(() => {
    if (!onParsedScriptChange) return;
    if (yamlText.trim() === "") {
      onParsedScriptChange(null);
      return;
    }
    const result = parseTestScript(yamlText);
    onParsedScriptChange(result.ok ? result.script : null);
  }, [yamlText, onParsedScriptChange]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleRunScript = useCallback(() => {
    // Clear previous state
    setValidationError(null);

    // Check if agent is selected
    if (!hasAgent) {
      setValidationError("Please select an agent before running a script.");
      return;
    }

    // Check if textarea is empty
    const trimmed = yamlText.trim();
    if (trimmed === "") {
      setValidationError("Script content is required.");
      return;
    }

    // Parse and validate
    const result = parseTestScript(yamlText);
    if (!result.ok) {
      const { error } = result;
      let message = error.message;
      if (error.line !== undefined) {
        message = `Line ${error.line}: ${message}`;
      }
      if (error.turnIndex !== undefined) {
        message = `Turn ${error.turnIndex}: ${message}`;
      }
      setValidationError(message);
      return;
    }

    // Valid — invoke callback
    onRunScript(result.script);
  }, [yamlText, hasAgent, onRunScript]);

  // ─── Batch Validation ──────────────────────────────────────────────────────

  // Validate batch inputs whenever they change
  useEffect(() => {
    if (!batchEnabled) {
      setIterationCountError(undefined);
      setConcurrencyError(undefined);
      return;
    }
    const result = validateBatchConfig(iterationCount, concurrency);
    setIterationCountError(result.iterationCountError);
    setConcurrencyError(result.concurrencyError);
  }, [batchEnabled, iterationCount, concurrency]);

  const batchValid = batchEnabled
    ? iterationCountError === undefined && concurrencyError === undefined
    : true;

  const handleRunBatch = useCallback(() => {
    // Clear previous state
    setValidationError(null);

    // Check if agent is selected
    if (!hasAgent) {
      setValidationError("Please select an agent before running a batch.");
      return;
    }

    // Check if textarea is empty
    const trimmed = yamlText.trim();
    if (trimmed === "") {
      setValidationError("Script content is required.");
      return;
    }

    // Parse and validate script
    const result = parseTestScript(yamlText);
    if (!result.ok) {
      const { error } = result;
      let message = error.message;
      if (error.line !== undefined) {
        message = `Line ${error.line}: ${message}`;
      }
      if (error.turnIndex !== undefined) {
        message = `Turn ${error.turnIndex}: ${message}`;
      }
      setValidationError(message);
      return;
    }

    // Validate batch config
    const batchResult = validateBatchConfig(iterationCount, concurrency);
    if (!batchResult.valid) {
      return;
    }

    // Valid — invoke callback
    onRunBatch?.(result.script, parseInt(iterationCount, 10), parseInt(concurrency, 10));
  }, [yamlText, hasAgent, iterationCount, concurrency, onRunBatch]);

  // ─── Derived State ─────────────────────────────────────────────────────────

  const isDisabled = disabled || isRunning || isBatchExecuting || isGenerating;
  // Batch controls are additionally locked while a batch is in-flight
  const isBatchControlDisabled = isDisabled || batchActive;

  // ─── Status bar state (derived from current YAML) ─────────────────────────

  const statusBarStatus: StatusBarState = (() => {
    // Explicit validation errors (agent not selected, file too large, etc.) take priority
    if (validationError) return { type: "error", message: validationError };
    if (yamlText.trim() === "") return { type: "idle" };
    const result = parseTestScript(yamlText);
    if (!result.ok) {
      const { error } = result;
      let message = error.message;
      if (error.turnIndex !== undefined) message = `Turn ${error.turnIndex + 1}: ${message}`;
      if (error.line !== undefined) message = `Line ${error.line}: ${message}`;
      return { type: "error", message };
    }
    const turnCount = result.script.turns.length;
    return { type: "success", message: `Valid — ${turnCount} turn${turnCount !== 1 ? "s" : ""}` };
  })();



  // ─── File Load ─────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        if (text.length <= MAX_CHARS) {
          setYamlText(text);
          setValidationError(null);
        } else {
          setValidationError(`File exceeds ${MAX_CHARS.toLocaleString()} character limit.`);
        }
      };
      reader.readAsText(file);

      // Reset the input so the same file can be loaded again
      e.target.value = "";
    },
    []
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SpaceBetween size="m">
      {/* YAML Input */}
      <FormField
        label={
          <span>
            Test Script (YAML){" "}
            <HelpIcon anchorId="script-yaml" pageId="testing" fieldName="Test Script (YAML)" />
          </span>
        }
        description={`Define a multi-turn conversation script. Max ${MAX_CHARS.toLocaleString()} characters.`}
      >
        <CodeTextarea
          value={yamlText}
          onChange={(v) => setYamlText(v)}
          readOnly={isRunning || isGenerating || isBatchExecuting}
          disabled={disabled}
          rows={12}
          placeholder={'name: "My test script"\nturns:\n  - customer: "Hello"\n  - customer: "I need help with my order"'}
          maxLength={MAX_CHARS}
          ariaLabel="YAML test script input"
          status={statusBarStatus}
          tabIndent
        />
      </FormField>

      {/* Action Buttons + Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {isBatchExecuting ? (
          null
        ) : isRunning ? (
          <Button variant="normal" onClick={onStop}>
            Stop
          </Button>
        ) : batchEnabled ? (
          <>
            <Button
              variant="primary"
              onClick={handleRunBatch}
              disabled={isDisabled || !batchValid || parsedScript === null}
            >
              Run Batch
            </Button>
            <Button
              variant="normal"
              onClick={handleLoadClick}
              disabled={isDisabled}
            >
              Load
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              onClick={handleRunScript}
              disabled={isDisabled}
            >
              Run Script
            </Button>
            <Button
              variant="normal"
              onClick={handleLoadClick}
              disabled={isDisabled}
            >
              Load
            </Button>
          </>
        )}

        {/* Generate variations — always visible in script mode, disabled until batch + script ready */}
        {!isBatchExecuting && !isRunning && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {isGenerating ? (
              <Button variant="normal" onClick={onCancelGeneration}>
                Cancel generation
              </Button>
            ) : (
            <Popover
              triggerType="custom"
              position="bottom"
              size="medium"
              dismissButton={false}
              content={
                <div style={{ padding: "4px 0" }}>
                  <SpaceBetween size="l">
                    <Box variant="p" color="text-body-secondary">
                      Generate natural paraphrases for each turn using Amazon Bedrock.
                      Each batch iteration will randomly sample one phrasing per turn.
                    </Box>
                    <SpaceBetween size="m">
                      <FormField label="Variations per turn">
                        <Select
                          selectedOption={
                            VARIATION_COUNT_OPTIONS.find((o) => o.value === String(variationCount)) ??
                            VARIATION_COUNT_OPTIONS[4] ??
                            null
                          }
                          onChange={handleVariationCountChange}
                          options={VARIATION_COUNT_OPTIONS}
                          ariaLabel="Variations per turn"
                        />
                      </FormField>
                      <FormField
                        label={
                          <span>
                            {`Temperature: ${temperature.toFixed(1)}`}{" "}
                            <HelpIcon anchorId="variation-temperature" pageId="testing" fieldName="Temperature" />
                          </span>
                        }
                      >
                        <Slider
                          value={temperature}
                          onChange={handleTemperatureChange}
                          min={0}
                          max={1}
                          step={0.1}
                          ariaLabel="Generation temperature"
                        />
                      </FormField>
                    </SpaceBetween>
                    <Button
                      variant="primary"
                      onClick={() => onGenerateVariations(variationCount, temperature)}
                      disabled={isBatchControlDisabled}
                    >
                      Generate
                    </Button>
                    {generationSummary !== null && (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Box variant="small" color="text-body-secondary">
                          {generationSummary.totalVariations} variations across{" "}
                          {generationSummary.turnsGenerated} turns
                        </Box>
                        <Button
                          variant="icon"
                          iconName="download"
                          ariaLabel="Export enriched script"
                          onClick={onExportEnrichedScript}
                        />
                      </div>
                    )}
                  </SpaceBetween>
                </div>
              }
            >
              <Button
                variant="normal"
                iconName="gen-ai"
                disabled={!batchEnabled || parsedScript === null || isDisabled}
              >
                Generate variations
              </Button>
            </Popover>
            )}
            <HelpIcon anchorId="generate-variations" pageId="testing" fieldName="Generate variations" />
          </div>
        )}

        {/* Running / generating indicator */}
        {(isRunning || isBatchExecuting) && (
          <StatusIndicator type="in-progress">
            Running
          </StatusIndicator>
        )}
        {isGenerating && (
          <StatusIndicator type="in-progress">
            Generating…
          </StatusIndicator>
        )}
      </div>

      {/* Batch Toggle — disabled until a valid script is loaded */}
      <Toggle
        onChange={({ detail }) => setBatchEnabled(detail.checked)}
        checked={batchEnabled}
        disabled={isBatchControlDisabled}
      >
        Batch
      </Toggle>

      {/* Batch config inputs */}
      {batchEnabled && (
        <SpaceBetween size="s" direction="horizontal">
          <FormField
            label="Iteration count"
            errorText={iterationCountError}
          >
            <Input
              type="number"
              value={iterationCount}
              onChange={({ detail }) => setIterationCount(detail.value)}
              disabled={isBatchControlDisabled}
              inputMode="numeric"
              ariaLabel="Iteration count"
            />
          </FormField>
          <FormField
            label="Target concurrency"
            errorText={concurrencyError}
          >
            <Input
              type="number"
              value={concurrency}
              onChange={({ detail }) => setConcurrency(detail.value)}
              disabled={isBatchControlDisabled}
              inputMode="numeric"
              ariaLabel="Concurrency"
            />
          </FormField>
        </SpaceBetween>
      )}

      {/* Hidden file input for Load */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Completion Summary */}
      {!isRunning && completionSummary && (
        <Box variant="span">
          <StatusIndicator
            type={
              completionSummary.terminationReason === "completed"
                ? "success"
                : completionSummary.terminationReason === "user_stopped"
                  ? "stopped"
                  : "warning"
            }
          >
            {completionSummary.terminationReason} —{" "}
            {(completionSummary.totalDurationMs / 1000).toFixed(1)}s
            {completionSummary.synthesisDurationMs != null && (
              <> (synthesis: {(completionSummary.synthesisDurationMs / 1000).toFixed(1)}s)</>
            )}
          </StatusIndicator>
        </Box>
      )}
    </SpaceBetween>
  );
}
