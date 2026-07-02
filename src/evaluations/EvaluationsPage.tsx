// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Flashbar from "@cloudscape-design/components/flashbar";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import Icon from "@cloudscape-design/components/icon";
import Pagination from "@cloudscape-design/components/pagination";
import ProgressBar from "@cloudscape-design/components/progress-bar";
import SpaceBetween from "@cloudscape-design/components/space-between";
import SplitPanel from "@cloudscape-design/components/split-panel";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";

import { useCollection } from "@cloudscape-design/collection-hooks";

import { useCredentials } from "../credentials/CredentialsContext";
import { useSplitPanelControl } from "../layouts/SplitPanelContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { HelpIcon } from "../contextual-help";
import { parseImportFile } from "./import-parser";
import { fetchTranscriptSegments } from "./contact-lens-client";
import { createHydrationOrchestrator } from "./hydration-orchestrator";
import { FormSelector } from "./FormSelector";
import { startAndPollEvaluations } from "./evaluation-poller";
import { computeAggregateMetrics, classifyVerdict } from "./summary-metrics";
import ResultsPanel from "./ResultsPanel";
import type {
  ContactEvaluation,
  EvalAggregateMetrics,
  EvaluationsState,
  HydrationEntry,
  HydrationStatus,
  TranscriptSegment,
} from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPTED_JSON_EXTENSION = ".json";

// ─── Import Meta for wizard step 1 ──────────────────────────────────────────

interface ImportedBatch {
  scriptName: string;
  totalIterations: number;
  completedCount: number;
  contacts: { contactId: string; iterationNumber: number }[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EvaluationsPage() {
  const { credentials } = useCredentials();
  const { instance, region } = useWorkspace();
  const instanceId = instance?.instanceId ?? "";
  const { setConfig } = useSplitPanelControl();

  const [state, setState] = useState<EvaluationsState>({
    phase: "import",
    importMeta: null,
    entries: new Map(),
  });

  const [flashMessages, setFlashMessages] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>();
  const [panelPosition, setPanelPosition] = useState<"side" | "bottom">("side");

  // ─── Wizard state ──────────────────────────────────────────────────────────
  const [importedBatch, setImportedBatch] = useState<ImportedBatch | null>(null);
  const [batchDragOver, setBatchDragOver] = useState(false);

  // ─── Evaluation state ──────────────────────────────────────────────────────
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedFormTitle, setSelectedFormTitle] = useState<string | null>(null);
  const [evaluationResults, setEvaluationResults] = useState<ContactEvaluation[]>([]);
  const [evaluationProgress, setEvaluationProgress] = useState<{ completed: number; total: number; started: number }>({ completed: 0, total: 0, started: 0 });
  const [evaluationPhase, setEvaluationPhase] = useState<"starting" | "polling" | "complete">("starting");
  const [aggregateMetrics, setAggregateMetrics] = useState<EvalAggregateMetrics[]>([]);

  const orchestratorRef = useRef<ReturnType<typeof createHydrationOrchestrator> | null>(null);
  const evaluationAbortRef = useRef<AbortController | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // ─── Split Panel Management ────────────────────────────────────────────────

  const selectedEntry = selectedContactId ? state.entries.get(selectedContactId) : undefined;

  // Get evaluations for the selected contact
  const selectedContactEvaluations = selectedContactId
    ? evaluationResults.filter((ev) => ev.contactId === selectedContactId)
    : [];

  useEffect(() => {
    if (!selectedEntry || selectedEntry.status !== "ready") {
      setConfig(null);
      return;
    }

    const hasEvaluations = selectedContactEvaluations.length > 0;

    setConfig({
      panel: (
        <SplitPanel
          header={`Iteration ${selectedEntry.iterationNumber} — ${selectedEntry.contactId}`}
          closeBehavior="hide"
          i18nStrings={{
            preferencesTitle: "Split panel preferences",
            preferencesPositionLabel: "Position",
            preferencesPositionDescription: "Choose where the panel appears relative to the content.",
            preferencesPositionSide: "Side",
            preferencesPositionBottom: "Bottom",
            preferencesConfirm: "Confirm",
            preferencesCancel: "Cancel",
            closeButtonAriaLabel: "Close panel",
            openButtonAriaLabel: "Open panel",
            resizeHandleAriaLabel: "Resize panel",
          }}
        >
          <div style={{ paddingBottom: "24px" }}>
            <SpaceBetween size="l">
              {hasEvaluations ? (
                <ResultsPanel
                  contactId={selectedEntry.contactId}
                  evaluation={selectedContactEvaluations[0]!}
                  transcript={selectedEntry.segments}
                />
              ) : (
                <ExpandableSection headerText="Transcript" variant="default">
                  <ContactTranscript segments={selectedEntry.segments} />
                </ExpandableSection>
              )}
            </SpaceBetween>
          </div>
        </SplitPanel>
      ),
      open: true,
      preferences: { position: panelPosition },
      onPreferencesChange: (detail) => setPanelPosition(detail.position as "side" | "bottom"),
      onToggle: (open) => {
        if (!open) setSelectedContactId(undefined);
      },
    });

    return () => {
      setConfig(null);
    };
  }, [selectedEntry, panelPosition, setConfig, selectedContactId, selectedContactEvaluations]);

  // Clean up split panel and abort pending async work on unmount
  useEffect(() => {
    return () => {
      setConfig(null);
      orchestratorRef.current?.abort();
      evaluationAbortRef.current?.abort();
    };
  }, [setConfig]);

  // ─── Flash Message Helpers ─────────────────────────────────────────────────

  function showError(message: string) {
    const id = crypto.randomUUID();
    setFlashMessages((prev) => [...prev, {
      type: "error" as const,
      content: message,
      dismissible: true,
      id,
      onDismiss: () => setFlashMessages((p) => p.filter((m) => m.id !== id)),
    }]);
  }

  function showWarning(message: string) {
    const id = crypto.randomUUID();
    setFlashMessages((prev) => [...prev, {
      type: "warning" as const,
      content: message,
      dismissible: true,
      id,
      onDismiss: () => setFlashMessages((p) => p.filter((m) => m.id !== id)),
    }]);
  }

  function clearFlash() {
    setFlashMessages([]);
  }

  // ─── File Import Logic — Step 1: Batch JSON ─────────────────────────────────

  const handleBatchFile = useCallback(
    (file: File) => {
      clearFlash();

      if (!file.name.toLowerCase().endsWith(ACCEPTED_JSON_EXTENSION)) {
        showError("Only .json files are accepted for batch export.");
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        showError("File exceeds the 50 MB size limit.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const contents = reader.result as string;
        const result = parseImportFile(contents);

        if (!result.success) {
          showError(result.error);
          return;
        }

        if (result.completedWithContactId.length === 0) {
          showWarning(
            "No completed iterations with contact IDs were found. Please import a file with completed test iterations."
          );
          return;
        }

        clearFlash();
        const batch: ImportedBatch = {
          scriptName: result.scriptName,
          totalIterations: result.totalIterations,
          completedCount: result.completedWithContactId.length,
          contacts: result.completedWithContactId,
        };
        setImportedBatch(batch);

        // Auto-start hydration
        const entries = new Map<string, HydrationEntry>();
        for (const item of batch.contacts) {
          entries.set(item.contactId, {
            contactId: item.contactId,
            iterationNumber: item.iterationNumber,
            status: "pending",
            segments: null,
            error: null,
          });
        }
        setState({
          phase: "hydrating",
          importMeta: {
            scriptName: batch.scriptName,
            totalIterations: batch.totalIterations,
            completedCount: batch.completedCount,
          },
          entries,
        });
        startHydration(batch.contacts);
      };

      reader.onerror = () => {
        showError("Failed to read file.");
      };

      reader.readAsText(file);
    },
    [credentials, instanceId, region]
  );

  // ─── Hydration ─────────────────────────────────────────────────────────────

  function startHydration(
    contacts: { contactId: string; iterationNumber: number }[]
  ) {
    if (!credentials || !instanceId || !region) return;

    const creds = credentials;
    const inst = instanceId;
    const reg = region;

    const orchestrator = createHydrationOrchestrator(
      contacts,
      (contactId: string, signal?: AbortSignal) =>
        fetchTranscriptSegments({
          contactId,
          instanceId: inst,
          credentials: creds,
          region: reg,
          signal,
        }),
      {
        onStatusChange: (
          contactId: string,
          status: HydrationStatus,
          segments?: TranscriptSegment[],
          error?: string
        ) => {
          setState((prev) => {
            const newEntries = new Map(prev.entries);
            const existing = newEntries.get(contactId);
            if (existing) {
              newEntries.set(contactId, {
                ...existing,
                status,
                segments: segments ?? existing.segments,
                error: error ?? (status === "failed" ? existing.error : null),
              });
            }

            // Transition to selecting_forms when all contacts are done
            const allDone = Array.from(newEntries.values()).every(
              (e) => e.status === "ready" || e.status === "failed"
            );

            return {
              ...prev,
              phase: allDone ? "selecting_forms" : prev.phase,
              entries: newEntries,
            };
          });
        },
      }
    );

    orchestratorRef.current = orchestrator;
    orchestrator.start();
  }

  // ─── Evaluate All ──────────────────────────────────────────────────────────

  const handleEvaluateAll = useCallback(async () => {
    if (!credentials || !instanceId || !region) return;

    const readyContacts = Array.from(state.entries.values())
      .filter((e) => e.status === "ready")
      .map((e) => ({ contactId: e.contactId }));

    if (readyContacts.length === 0 || !selectedFormId) return;

    const totalPairs = readyContacts.length;

    setState((prev) => ({ ...prev, phase: "evaluating" }));
    setEvaluationProgress({ completed: 0, total: totalPairs, started: 0 });
    setEvaluationPhase("starting");
    setEvaluationResults([]);

    const controller = new AbortController();
    evaluationAbortRef.current = controller;

    try {
      const results = await startAndPollEvaluations({
        instanceId,
        credentials,
        region,
        contacts: readyContacts,
        formId: selectedFormId,
        signal: controller.signal,
        onEvaluationUpdate: (evaluation) => {
          setEvaluationResults((prev) => {
            // Replace existing or add new
            const key = `${evaluation.contactId}:${evaluation.evaluationFormId}`;
            const existing = prev.findIndex(
              (e) => `${e.contactId}:${e.evaluationFormId}` === key
            );
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = evaluation;
              return updated;
            }
            return [...prev, evaluation];
          });

          // Update progress counter for terminal statuses
          if (evaluation.status === "completed" || evaluation.status === "failed") {
            setEvaluationProgress((prev) => ({
              ...prev,
              completed: prev.completed + 1,
            }));
          }
        },
        onStartProgress: (started, _total) => {
          setEvaluationProgress((prev) => ({ ...prev, started }));
        },
        onPhaseChange: (phase) => {
          setEvaluationPhase(phase);
        },
      });

      // Compute aggregate metrics
      const forms = [{
        evaluationFormId: selectedFormId,
        title: selectedFormTitle ?? selectedFormId,
        lastActivatedTime: 0,
        autoEvaluationEnabled: false,
      }];

      const perForm = computeAggregateMetrics(results, forms);

      setAggregateMetrics(perForm);
      setEvaluationResults(results);
      setState((prev) => ({ ...prev, phase: "complete" }));
    } catch (err) {
      if (err instanceof Error && err.message === "Aborted") {
        // User cancelled — stay in selecting_forms
        setState((prev) => ({ ...prev, phase: "selecting_forms" }));
      } else {
        showError(err instanceof Error ? err.message : "Evaluation failed");
        setState((prev) => ({ ...prev, phase: "selecting_forms" }));
      }
    }
  }, [credentials, instanceId, region, state.entries, selectedFormId]);

  const handleCancelEvaluation = useCallback(() => {
    evaluationAbortRef.current?.abort();
    evaluationAbortRef.current = null;
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    orchestratorRef.current?.abort();
    orchestratorRef.current = null;
    evaluationAbortRef.current?.abort();
    evaluationAbortRef.current = null;
    setSelectedContactId(undefined);
    setImportedBatch(null);
    setSelectedFormId(null);
    setSelectedFormTitle(null);
    setEvaluationResults([]);
    setEvaluationProgress({ completed: 0, total: 0, started: 0 });
    setAggregateMetrics([]);
    setState({ phase: "import", importMeta: null, entries: new Map() });
    clearFlash();
  }, []);

  const handleRowClick = useCallback((entry: HydrationEntry) => {
    if (entry.status === "ready") {
      setSelectedContactId(entry.contactId);
    }
  }, []);

  // ─── Drag & Drop Handlers — Batch ─────────────────────────────────────────

  const handleBatchDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBatchDragOver(true);
  }, []);

  const handleBatchDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBatchDragOver(false);
  }, []);

  const handleBatchDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setBatchDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleBatchFile(files[0]!);
      }
    },
    [handleBatchFile]
  );

  const handleBatchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleBatchFile(files[0]!);
      }
      e.target.value = "";
    },
    [handleBatchFile]
  );

  const handleBatchBrowseClick = useCallback(() => {
    batchFileInputRef.current?.click();
  }, []);

  // ─── Computed Values ───────────────────────────────────────────────────────

  const entriesArray = Array.from(state.entries.values());
  const pendingCount = entriesArray.filter((e) => e.status === "pending").length;
  const loadingCount = entriesArray.filter((e) => e.status === "loading").length;
  const awaitingCount = entriesArray.filter((e) => e.status === "awaiting_analysis").length;
  const readyCount = entriesArray.filter((e) => e.status === "ready").length;
  const failedCount = entriesArray.filter((e) => e.status === "failed").length;
  const totalCount = entriesArray.length;
  const hydrationCompletedCount = readyCount + failedCount;
  const hydrationProgressPercent = totalCount > 0 ? Math.round((hydrationCompletedCount / totalCount) * 100) : 0;

  const allContactsReady = totalCount > 0 && entriesArray.every((e) => e.status === "ready" || e.status === "failed");
  const canEvaluate = (state.phase === "selecting_forms") && allContactsReady && selectedFormId != null && readyCount > 0;

  const evalProgressPercent = evaluationProgress.total > 0
    ? Math.round((evaluationProgress.completed / evaluationProgress.total) * 100)
    : 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Evaluate your AI agent's conversations using Amazon Connect Evaluations."
      >
        Evaluations
      </Header>

      {flashMessages.length > 0 && <Flashbar items={flashMessages} />}

      {/* ─── Import State — Wizard ─────────────────────────────────────── */}
      {state.phase === "import" && (
        <Container header={<Header variant="h2">Set up evaluation{" "}<HelpIcon anchorId="evaluation-setup" pageId="evaluations" fieldName="Set up evaluation" /></Header>}>
          <SpaceBetween size="l">
            {/* Step 1: Batch export */}
            {!importedBatch && (
              <div>
                <Box variant="h4" padding={{ bottom: "xs" }}>
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#0972d3", color: "#fff", fontSize: "13px", fontWeight: 600 }}>1</span>
                    <span>Test results</span>
                  </SpaceBetween>
                </Box>
                <div
                  onDragOver={handleBatchDragOver}
                  onDragLeave={handleBatchDragLeave}
                  onDrop={handleBatchDrop}
                  style={{
                    border: `2px dashed ${batchDragOver ? "#0972d3" : "#d1d5db"}`,
                    borderRadius: "8px",
                    padding: "32px",
                    textAlign: "center",
                    backgroundColor: batchDragOver ? "#f0f8ff" : "#fafafa",
                    transition: "all 0.2s ease",
                    cursor: "pointer",
                  }}
                  onClick={handleBatchBrowseClick}
                  role="button"
                  tabIndex={0}
                  aria-label="Drop zone for test results JSON file"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleBatchBrowseClick();
                  }}
                >
                  <SpaceBetween size="xs" direction="vertical" alignItems="center">
                    <Box variant="p" color="text-body-secondary">
                      Drop your test results JSON here
                    </Box>
                    <Box variant="small" color="text-status-inactive">
                      .json up to 50 MB
                    </Box>
                    <Button iconName="upload" variant="normal">Choose file</Button>
                  </SpaceBetween>
                </div>
                <input
                  ref={batchFileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={handleBatchInputChange}
                />
              </div>
            )}

            {importedBatch && (
              <div>
                <Box variant="h4" padding={{ bottom: "xs" }}>
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Icon name="status-positive" variant="success" />
                    <span>Test results</span>
                  </SpaceBetween>
                </Box>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", backgroundColor: "#f2fcf3", borderRadius: "6px", border: "1px solid #b8e6b8" }}>
                  <div style={{ flex: 1 }}>
                    <Box variant="p"><strong>{importedBatch.scriptName}</strong></Box>
                    <Box variant="small" color="text-body-secondary">
                      {importedBatch.completedCount} contact{importedBatch.completedCount !== 1 ? "s" : ""}
                    </Box>
                  </div>
                  <Button variant="inline-link" onClick={() => { setImportedBatch(null); clearFlash(); }}>
                    Replace
                  </Button>
                </div>
              </div>
            )}
          </SpaceBetween>
        </Container>
      )}

      {/* ─── Hydrating / Selecting Forms / Evaluating / Complete ─────── */}
      {state.phase !== "import" && (
        <SpaceBetween size="l">
          {/* Hydration progress */}
          {(state.phase === "hydrating") && state.importMeta && (
            <Container header={<Header variant="h2">{state.importMeta.scriptName}</Header>}>
              <SpaceBetween size="m">
                <Box variant="small" color="text-body-secondary">
                  {state.importMeta.completedCount} of {state.importMeta.totalIterations} iterations
                  with contact IDs
                </Box>
                <ProgressBar
                  value={hydrationProgressPercent}
                  label="Hydration progress"
                  description={`${hydrationCompletedCount} of ${totalCount} contacts processed`}
                  additionalInfo={
                    <SpaceBetween size="xs" direction="horizontal">
                      <StatusIndicator type="pending">Pending: {pendingCount}</StatusIndicator>
                      <StatusIndicator type="in-progress">Loading: {loadingCount}</StatusIndicator>
                      <StatusIndicator type="in-progress">Awaiting: {awaitingCount}</StatusIndicator>
                      <StatusIndicator type="success">Ready: {readyCount}</StatusIndicator>
                      <StatusIndicator type="error">Failed: {failedCount}</StatusIndicator>
                    </SpaceBetween>
                  }
                />
              </SpaceBetween>
            </Container>
          )}

          {/* Form Selector — visible during hydrating, selecting_forms, evaluating */}
          {(state.phase === "hydrating" || state.phase === "selecting_forms" || state.phase === "evaluating" || state.phase === "complete") && credentials && region && (
            <Container header={<Header variant="h2">Evaluation forms</Header>}>
              <SpaceBetween size="m">
                <FormSelector
                  instanceId={instanceId}
                  credentials={credentials}
                  region={region}
                  selectedFormId={selectedFormId}
                  onSelectionChange={(formId, title) => {
                    setSelectedFormId(formId);
                    setSelectedFormTitle(title);
                  }}
                />
                <SpaceBetween size="xs" direction="horizontal">
                  <Button
                    variant="primary"
                    disabled={!canEvaluate}
                    onClick={handleEvaluateAll}
                  >
                    Evaluate all
                  </Button>
                  {state.phase === "evaluating" && (
                    <Button variant="normal" onClick={handleCancelEvaluation}>
                      Cancel
                    </Button>
                  )}
                </SpaceBetween>
              </SpaceBetween>
            </Container>
          )}

          {/* Evaluation progress */}
          {state.phase === "evaluating" && (
            <Container header={<Header variant="h2">Evaluation progress</Header>}>
              <SpaceBetween size="m">
                {evaluationPhase === "starting" && (
                  <ProgressBar
                    value={evaluationProgress.total > 0 ? Math.round((evaluationProgress.started / evaluationProgress.total) * 100) : 0}
                    label="Starting evaluations"
                    description={`${evaluationProgress.started} of ${evaluationProgress.total} evaluations submitted to Connect`}
                    additionalInfo={
                      <SpaceBetween size="xs" direction="horizontal">
                        <StatusIndicator type="in-progress">Submitting (5 concurrent)</StatusIndicator>
                      </SpaceBetween>
                    }
                  />
                )}
                {evaluationPhase === "polling" && (
                  <ProgressBar
                    value={evalProgressPercent}
                    label="Waiting for evaluation results"
                    description={`${evaluationProgress.completed} of ${evaluationProgress.total} evaluations completed`}
                    additionalInfo={
                      <SpaceBetween size="xs" direction="horizontal">
                        <StatusIndicator type="success">Started: {evaluationProgress.started}</StatusIndicator>
                        <StatusIndicator type="in-progress">Awaiting results: {evaluationProgress.total - evaluationProgress.completed}</StatusIndicator>
                        <StatusIndicator type="success">Completed: {evaluationProgress.completed}</StatusIndicator>
                      </SpaceBetween>
                    }
                  />
                )}
              </SpaceBetween>
            </Container>
          )}

          {/* Aggregate metrics on completion */}
          {state.phase === "complete" && aggregateMetrics.length > 0 && aggregateMetrics[0]!.totalEvaluated > 0 && (
            <Container header={<Header variant="h2">Summary</Header>}>
              <SpaceBetween size="l">
                {/* Per-form detail sections */}
                {aggregateMetrics.map((metric) => (
                  <ExpandableSection
                    key={metric.formId}
                    headerText={`${metric.formTitle} — ${metric.passRate.toFixed(1)}% pass rate`}
                    variant="default"
                    defaultExpanded
                  >
                    <SpaceBetween size="m">
                      {/* Key metrics row */}
                      <SpaceBetween size="xs" direction="horizontal">
                        <Box variant="p"><strong>Pass rate:</strong> {metric.passRate.toFixed(1)}%</Box>
                        <Box variant="p"><strong>Avg score:</strong> {metric.averageScore.toFixed(1)}%</Box>
                        <Box variant="p"><strong>Evaluated:</strong> {metric.totalEvaluated}</Box>
                      </SpaceBetween>

                      {/* Score distribution bar chart */}
                      <ScoreDistributionChart distribution={metric.scoreDistribution} total={metric.totalEvaluated} />

                      {/* Per-question pass rates */}
                      {Object.keys(metric.perQuestionPassRates).length > 0 && (
                        <ExpandableSection headerText="Per-question pass rates" variant="default">
                          <PerQuestionPassRates
                            passRates={metric.perQuestionPassRates}
                            evaluationResults={evaluationResults}
                            formId={metric.formId}
                          />
                        </ExpandableSection>
                      )}
                    </SpaceBetween>
                  </ExpandableSection>
                ))}
              </SpaceBetween>
            </Container>
          )}

          {/* Contacts table */}
          <ContactsTable
            entries={entriesArray}
            selectedContactId={selectedContactId}
            onSelect={handleRowClick}
            evaluationResults={evaluationResults}
          />

          {/* Actions */}
          <div style={{ display: "flex", gap: 12 }}>
            <Button onClick={handleReset} variant="normal">New import</Button>
          </div>
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}

// ─── Score Distribution Chart ────────────────────────────────────────────────

function ScoreDistributionChart({
  distribution,
  total,
}: {
  distribution: import("./types").ScoreDistribution;
  total: number;
}) {
  const buckets = [
    { label: "0–25%", count: distribution.bucket0to25, color: "#d91515" },
    { label: "26–50%", count: distribution.bucket26to50, color: "#ec7211" },
    { label: "51–75%", count: distribution.bucket51to75, color: "#f2c94c" },
    { label: "76–100%", count: distribution.bucket76to100, color: "#037f0c" },
  ];

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div>
      <Box variant="small" padding={{ bottom: "xs" }}>
        <strong>Score distribution</strong>
      </Box>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {buckets.map((bucket) => {
          const widthPercent = total > 0 ? (bucket.count / maxCount) * 100 : 0;
          return (
            <div key={bucket.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "60px", fontSize: "12px", color: "#5f6b7a", flexShrink: 0 }}>
                {bucket.label}
              </div>
              <div style={{ flex: 1, height: "18px", backgroundColor: "#f2f3f3", borderRadius: "3px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${widthPercent}%`,
                    height: "100%",
                    backgroundColor: bucket.color,
                    borderRadius: "3px",
                    transition: "width 0.3s ease",
                    minWidth: bucket.count > 0 ? "4px" : "0",
                  }}
                />
              </div>
              <div style={{ width: "70px", fontSize: "12px", color: "#5f6b7a", textAlign: "right", flexShrink: 0 }}>
                {bucket.count} ({total > 0 ? ((bucket.count / total) * 100).toFixed(0) : 0}%)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Per-Question Pass Rates ─────────────────────────────────────────────────

function PerQuestionPassRates({
  passRates,
  evaluationResults,
  formId,
}: {
  passRates: Record<string, number>;
  evaluationResults: ContactEvaluation[];
  formId: string;
}) {
  // Build questionRefId → questionTitle mapping from evaluation answers
  const questionTitleMap = new Map<string, string>();
  for (const ev of evaluationResults) {
    if (ev.evaluationFormId !== formId || !ev.answers) continue;
    for (const answer of ev.answers) {
      if (!questionTitleMap.has(answer.questionRefId)) {
        questionTitleMap.set(answer.questionRefId, answer.questionTitle);
      }
    }
  }

  const entries = Object.entries(passRates).sort((a, b) => a[1] - b[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {entries.map(([questionRefId, rate]) => {
        const title = questionTitleMap.get(questionRefId) ?? questionRefId;
        const barColor = rate >= 90 ? "#037f0c" : rate >= 50 ? "#ec7211" : "#d91515";
        return (
          <div key={questionRefId} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1, fontSize: "13px", color: "#16191f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={title}>
              {title}
            </div>
            <div style={{ width: "80px", height: "14px", backgroundColor: "#f2f3f3", borderRadius: "3px", overflow: "hidden", flexShrink: 0 }}>
              <div
                style={{
                  width: `${rate}%`,
                  height: "100%",
                  backgroundColor: barColor,
                  borderRadius: "3px",
                  minWidth: rate > 0 ? "3px" : "0",
                }}
              />
            </div>
            <div style={{ width: "45px", fontSize: "12px", color: "#5f6b7a", textAlign: "right", flexShrink: 0 }}>
              {rate.toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Contacts Table ──────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function ContactsTable({
  entries,
  selectedContactId,
  onSelect,
  evaluationResults,
}: {
  entries: HydrationEntry[];
  selectedContactId: string | undefined;
  onSelect: (entry: HydrationEntry) => void;
  evaluationResults: ContactEvaluation[];
}) {
  // Build a lookup: contactId → evaluation result for the single form
  const contactScoreLookup = new Map<string, { score: number | null; status: ContactEvaluation["status"]; error?: string }>();
  for (const ev of evaluationResults) {
    contactScoreLookup.set(ev.contactId, {
      score: ev.status === "completed" ? (ev.score ?? null) : null,
      status: ev.status,
      error: ev.error,
    });
  }

  const columnDefinitions = [
    {
      id: "iteration",
      header: "#",
      cell: (item: HydrationEntry) => item.iterationNumber,
      sortingField: "iterationNumber",
      width: 60,
    },
    {
      id: "contactId",
      header: "Contact ID",
      cell: (item: HydrationEntry) => <Box variant="code">{item.contactId}</Box>,
    },
    {
      id: "status",
      header: "Status",
      cell: (item: HydrationEntry) => <HydrationStatusIndicator status={item.status} />,
      width: 140,
    },
    {
      id: "score",
      header: "Score",
      cell: (item: HydrationEntry) => {
        const ev = contactScoreLookup.get(item.contactId);
        if (!ev) return "—";
        if (ev.status === "failed") return <Icon name="status-negative" variant="error" />;
        if (ev.status !== "completed" || ev.score == null) return "—";
        return `${ev.score.toFixed(1)}%`;
      },
      sortingField: "score",
      sortingComparator: (a: HydrationEntry, b: HydrationEntry) => {
        const evA = contactScoreLookup.get(a.contactId);
        const evB = contactScoreLookup.get(b.contactId);
        const scoreA = evA?.status === "completed" ? (evA.score ?? -1) : -1;
        const scoreB = evB?.status === "completed" ? (evB.score ?? -1) : -1;
        return scoreA - scoreB;
      },
      width: 100,
    },
    {
      id: "verdict",
      header: "Verdict",
      cell: (item: HydrationEntry) => {
        const ev = contactScoreLookup.get(item.contactId);
        if (!ev) return "—";
        if (ev.status === "failed") return <StatusIndicator type="error">error</StatusIndicator>;
        if (ev.status !== "completed" || ev.score == null) return "—";
        const verdict = classifyVerdict(ev.score);
        switch (verdict) {
          case "pass":
            return <StatusIndicator type="success">pass</StatusIndicator>;
          case "partial":
            return <StatusIndicator type="warning">partial</StatusIndicator>;
          case "fail":
            return <StatusIndicator type="error">fail</StatusIndicator>;
        }
      },
      width: 100,
    },
    {
      id: "error",
      header: "Error",
      cell: (item: HydrationEntry) =>
        item.error ? (
          <Box variant="small" color="text-status-error">
            {item.error}
          </Box>
        ) : (
          "—"
        ),
    },
  ];

  const { items, collectionProps, paginationProps } = useCollection(entries, {
    pagination: { pageSize: PAGE_SIZE },
    sorting: {
      defaultState: { sortingColumn: { sortingField: "iterationNumber" }, isDescending: false },
    },
  });

  return (
    <Table
      {...collectionProps}
      header={<Header variant="h2" counter={`(${entries.length})`}>Contacts</Header>}
      columnDefinitions={columnDefinitions}
      items={items}
      selectionType="single"
      selectedItems={entries.filter((e) => e.contactId === selectedContactId)}
      onSelectionChange={({ detail }) => {
        const selected = detail.selectedItems[0];
        if (selected) onSelect(selected);
      }}
      trackBy="contactId"
      variant="full-page"
      pagination={entries.length > PAGE_SIZE ? <Pagination {...paginationProps} /> : undefined}
      empty={<Box textAlign="center">No contacts</Box>}
    />
  );
}

// ─── Status Indicator ────────────────────────────────────────────────────────

function HydrationStatusIndicator({ status }: { status: HydrationStatus }) {
  switch (status) {
    case "pending":
      return <StatusIndicator type="pending">Pending</StatusIndicator>;
    case "loading":
      return <StatusIndicator type="in-progress">Loading</StatusIndicator>;
    case "awaiting_analysis":
      return <StatusIndicator type="in-progress">Awaiting analysis</StatusIndicator>;
    case "ready":
      return <StatusIndicator type="success">Ready</StatusIndicator>;
    case "failed":
      return <StatusIndicator type="error">Failed</StatusIndicator>;
  }
}

// ─── Contact Transcript ──────────────────────────────────────────────────────

function ContactTranscript({ segments }: { segments: TranscriptSegment[] | null }) {
  if (!segments || segments.length === 0) {
    return (
      <Box textAlign="center" color="text-status-inactive" padding="l">
        No transcript segments were found for this contact.
      </Box>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {segments.map((segment, index) => (
        <SegmentBubble key={index} segment={segment} />
      ))}
    </div>
  );
}

// ─── Segment Bubble ──────────────────────────────────────────────────────────

function SegmentBubble({ segment }: { segment: TranscriptSegment }) {
  const isCustomer = segment.participantRole === "CUSTOMER";

  const timestamp = new Date(segment.timestamp).toLocaleTimeString();

  const bubbleStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "8px",
    maxWidth: "85%",
    alignSelf: isCustomer ? "flex-end" : "flex-start",
    backgroundColor: isCustomer ? "#e8f8e8" : "#f0f4ff",
    border: `1px solid ${isCustomer ? "#b8e6b8" : "#c4d5f7"}`,
  };

  const labelColor = isCustomer ? "#037f0c" : "#0972d3";

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: labelColor,
    marginBottom: "2px",
  };

  return (
    <div style={bubbleStyle}>
      <div style={labelStyle}>
        {segment.participantRole} · {timestamp}
      </div>
      <div style={{ fontSize: "13px", lineHeight: "1.4" }}>{segment.displayText}</div>
    </div>
  );
}
