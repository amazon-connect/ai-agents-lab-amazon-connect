// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState, useMemo } from "react";

import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Select from "@cloudscape-design/components/select";
import Slider from "@cloudscape-design/components/slider";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Toggle from "@cloudscape-design/components/toggle";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";

import { useCredentials } from "../credentials/CredentialsContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useAppNotifications } from "../layouts/AppNotificationContext";
import type { AIAgent } from "../test-harness/agent-client";
import { getAgentSystemPrompt } from "../test-harness/agent-client";
import type { ChatMessage, ChatSession, ChatState } from "../test-harness/chat-client";
import {
  startChat,
  sendMessage,
  disconnectChat,
  isValidMessage,
} from "../test-harness/chat-client";
import type { SetupState } from "../test-harness/setup-manager";
import { detectInfrastructure, provisionInfrastructure } from "../test-harness/setup-manager";
import type { SetupModalMode } from "./SetupModal";
import type {
  TestScript,
  ScriptProgress,
  TerminationReason,
  TurnTranscript,
  ConversationTranscript,
} from "../test-harness/script-types";
import type { BatchConfig, IterationResult } from "../test-harness/batch-types";
import { runScript } from "../test-harness/script-runner";
import { runBatch } from "../test-harness/batch-runner";
import {
  generateExportFilename,
  buildExportPayload,
  downloadJson,
} from "../test-harness/batch-export";
import { formatTestScript } from "../test-harness/script-parser";
import { generateVariations } from "../test-harness/variation-generator";

import type { SelectProps } from "@cloudscape-design/components/select";

import { runVoiceScript } from "../test-harness/voice-script-executor";
import { runVoiceBatch } from "../test-harness/voice-batch-runner";
import type { VoiceBatchConfig } from "../test-harness/voice-batch-runner";
import { fetchAvailableVoices, synthesizeAll } from "../test-harness/polly-synthesizer";
import type { PollyVoice, VoiceTerminationReason, VoiceTranscript } from "../test-harness/voice-types";

import AgentSelector from "./AgentSelector";
import BatchResultsTable from "./BatchResultsTable";
import ChatPanel from "./ChatPanel";
import { HelpIcon } from "../contextual-help";
import RunOverviewPanel from "./RunOverviewPanel";
import ScriptInputPanel from "./ScriptInputPanel";
import ScriptMetricsPanel from "./ScriptMetricsPanel";
import SetupModal from "./SetupModal";
import StatusButton from "./StatusButton";
import TranscriptDetail from "./TranscriptDetail";
import VoicePanel from "./VoicePanel";
import { useBatchState } from "./use-batch-state";

// ─── Evaluation Form Imports ─────────────────────────────────────────────────

import EvaluationFormTab from "../evaluations/EvaluationFormTab";
import type { EvalFormState } from "../evaluations/EvaluationFormTab";
import DeployFormModal from "../evaluations/DeployFormModal";
import type { DeployModalState } from "../evaluations/DeployFormModal";
import { FORM_GENERATION_PROMPT, FORM_REFINEMENT_PROMPT } from "../evaluations/form-generation-prompt";
import { stripCodeFences, replaceRefIds, validateFormStructure, formatTranscript } from "../evaluations/form-post-processing";
import { createEvaluationForm, activateEvaluationForm } from "../evaluations/evaluation-form-client";
import { invokeBedrock } from "../evaluations/bedrock-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestingPageState {
  channel: "chat" | "voice";
  selectedAgent: AIAgent | null;
  setupState: SetupState;
  chatState: ChatState;
  chatContactId: string | null;
  messages: ChatMessage[];
  isTyping: boolean;
  inputValue: string;
  isModalVisible: boolean;
  mode: "manual" | "script";
  scriptRunning: boolean;
  scriptProgress: ScriptProgress | null;
  scriptCompletionSummary: {
    terminationReason: TerminationReason;
    totalDurationMs: number;
  } | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "test-harness-config-";

function getStorageKey(instanceId: string): string {
  return `${STORAGE_KEY_PREFIX}${instanceId}`;
}

// ─── Initial State ───────────────────────────────────────────────────────────

const INITIAL_SETUP_STATE: SetupState = {
  status: "idle",
  currentStep: null,
  completedSteps: [],
  error: null,
  infrastructure: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TestingPage() {
  const { credentials } = useCredentials();
  const { instance, assistant, region, assistants } = useWorkspace();
  const { reportError } = useAppNotifications();

  const instanceId = instance?.instanceId ?? "";
  const assistantId = assistant?.assistantId ?? "";
  // assistantArn may be empty when restored from sessionStorage — resolve from the full list
  const assistantArn =
    assistant?.assistantArn ||
    assistants.find((a) => a.assistantId === assistantId)?.assistantArn ||
    "";

  const [state, setState] = useState<TestingPageState>({
    channel: "chat",
    selectedAgent: null,
    setupState: INITIAL_SETUP_STATE,
    chatState: "idle",
    chatContactId: null,
    messages: [],
    isTyping: false,
    inputValue: "",
    isModalVisible: false,
    mode: "manual",
    scriptRunning: false,
    scriptProgress: null,
    scriptCompletionSummary: null,
  });

  const [modalMode, setModalMode] = useState<SetupModalMode>("provisioning");
  const [sendError, setSendError] = useState<string | null>(null);
  const [voiceCallActive, setVoiceCallActive] = useState(false);

  // Agent-change confirmation modal state
  const [agentChangeCandidate, setAgentChangeCandidate] = useState<AIAgent | null>(null);

  // Track the active chat session for sending messages
  const chatSessionRef = useRef<ChatSession | null>(null);
  // Track previous agent for revert on cancel
  const previousAgentRef = useRef<AIAgent | null>(null);
  // AbortController for script execution
  const scriptAbortRef = useRef<AbortController | null>(null);
  // Store per-turn latencies (message index in messages array → latencyMs)
  const turnLatenciesRef = useRef<Map<number, number>>(new Map());

  // ─── Voice Script Execution State (owned by TestingPage) ─────────────────
  const [voiceScriptRunning, setVoiceScriptRunning] = useState(false);
  const [voiceScriptProgress, setVoiceScriptProgress] = useState<ScriptProgress | null>(null);
  const [voiceSynthesisProgress, setVoiceSynthesisProgress] = useState<{ current: number; total: number } | null>(null);
  const [voiceCustomerStreaming, setVoiceCustomerStreaming] = useState(false);
  const [voiceScriptCompletionSummary, setVoiceScriptCompletionSummary] = useState<{
    terminationReason: VoiceTerminationReason;
    totalDurationMs: number;
    synthesisDurationMs: number;
  } | null>(null);
  const [voices, setVoices] = useState<PollyVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SelectProps.Option | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const voiceScriptAbortRef = useRef<AbortController | null>(null);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState(2000);
  const [silenceThresholdInput, setSilenceThresholdInput] = useState("2");

  // ─── Chat Settle Duration State ────────────────────────────────────────────
  const [chatSettleDurationMs, setChatSettleDurationMs] = useState(5000);
  const [chatSettleDurationInput, setChatSettleDurationInput] = useState("5");

  // ─── Script Metrics Panel State ────────────────────────────────────────────
  const [chatScriptTranscript, setChatScriptTranscript] = useState<ConversationTranscript | null>(null);
  const [voiceScriptTranscript, setVoiceScriptTranscript] = useState<VoiceTranscript | null>(null);

  // ─── Variation Generation State ───────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSummary, setGenerationSummary] = useState<{
    turnsGenerated: number;
    totalVariations: number;
  } | null>(null);
  const [parsedScript, setParsedScript] = useState<TestScript | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);

  // useVariations is now derived per-run directly from the script passed to
  // handleRunBatch / handleRunVoiceBatch, avoiding stale closure issues.

  // ─── Evaluation Form State ─────────────────────────────────────────────────
  const [evalFormState, setEvalFormState] = useState<EvalFormState | null>(null);
  const [evalFormActiveTab, setEvalFormActiveTab] = useState<string>("conversation");
  const evalFormJsonRef = useRef<string>("");
  const [deployModalState, setDeployModalState] = useState<DeployModalState | null>(null);

  // Task 12.2 — real implementation of handleGenerateVariations
  const handleGenerateVariations = useCallback(
    async (count: number, temperature: number) => {
      if (!parsedScript) return;
      if (!credentials || !region) return;

      setIsGenerating(true);
      const abortController = new AbortController();
      generationAbortRef.current = abortController;

      try {
        const result = await generateVariations({
          script: parsedScript,
          variationCount: count,
          temperature,
          credentials,
          region,
          signal: abortController.signal,
        });

        // Update the in-memory parsed script state
        setParsedScript(result.script);
        // Re-serialise and overwrite the textarea in ScriptInputPanel
        const yaml = formatTestScript(result.script);
        window.dispatchEvent(new CustomEvent("script-import", { detail: yaml }));
        // Store the generation summary
        setGenerationSummary({
          turnsGenerated: result.turnsGenerated,
          totalVariations: result.totalVariations,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — leave textarea unchanged, just clear the generating flag
        } else {
          reportError(err);
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [parsedScript, credentials, region, reportError]
  );

  // Task 12.3 — cancel generation by aborting the in-flight AbortController
  const handleCancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
  }, []);

  const handleExportEnrichedScript = useCallback(() => {
    if (!parsedScript) return;
    const yaml = formatTestScript(parsedScript);
    window.dispatchEvent(new CustomEvent("script-import", { detail: yaml }));
  }, [parsedScript]);

  // Task 12.5 — keep parsedScript in sync with whatever the user has typed/loaded
  const handleParsedScriptChange = useCallback((script: TestScript | null) => {
    setParsedScript(script);
  }, []);

  // ─── Evaluation Form Handlers ──────────────────────────────────────────────

  const handleCreateEvaluationForm = useCallback(async () => {
    setEvalFormState({ status: "generating" });
    setEvalFormActiveTab("evaluation-form");

    const transcript = formatTranscript(state.messages);

    // Best-effort: fetch the agent's system prompt for richer evaluation form generation
    let agentPromptText: string | null = null;
    if (state.selectedAgent && credentials && region) {
      agentPromptText = await getAgentSystemPrompt({
        credentials,
        region,
        assistantId,
        agentId: state.selectedAgent.agentId,
        agentType: state.selectedAgent.type,
      });
    }

    // Build the user message with optional agent system prompt context
    let userMessage = "";
    if (agentPromptText) {
      userMessage += `Agent system prompt:\n${agentPromptText}\n\n`;
    }
    userMessage += `Conversation transcript:\n${transcript}`;

    try {
      const raw = await invokeBedrock({
        systemPrompt: FORM_GENERATION_PROMPT,
        userMessage,
        credentials: credentials!,
        region: region!,
      });

      const stripped = stripCodeFences(raw);
      const parsed = JSON.parse(stripped);
      const processed = replaceRefIds(parsed);
      const json = JSON.stringify(processed, null, 2);
      const validationError = validateFormStructure(processed);

      evalFormJsonRef.current = json;
      setEvalFormState({ status: "preview", json, validationError });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setEvalFormState({ status: "error", error: message });
    }
  }, [state.messages, state.selectedAgent, credentials, region, assistantId]);

  const handleRefine = useCallback(async (instruction: string) => {
    const previousJson = evalFormJsonRef.current;

    setEvalFormState({ status: "refining" });

    const userMessage = `Current evaluation form:\n${previousJson}\n\nInstruction: ${instruction}`;

    try {
      const raw = await invokeBedrock({
        systemPrompt: FORM_REFINEMENT_PROMPT,
        userMessage,
        credentials: credentials!,
        region: region!,
      });

      const stripped = stripCodeFences(raw);
      const parsed = JSON.parse(stripped);
      const processed = replaceRefIds(parsed);
      const json = JSON.stringify(processed, null, 2);
      const validationError = validateFormStructure(processed);

      evalFormJsonRef.current = json;
      setEvalFormState({ status: "preview", json, validationError });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Refinement failed";
      setEvalFormState({ status: "preview", json: previousJson, validationError: message });
    }
  }, [credentials, region]);

  const handleEvalFormJsonChange = useCallback((json: string) => {
    let validationError: string | null = null;
    try {
      const parsed = JSON.parse(json);
      validationError = validateFormStructure(parsed);
    } catch (err) {
      validationError = err instanceof Error ? err.message : "Invalid JSON";
    }
    evalFormJsonRef.current = json;
    setEvalFormState({ status: "preview", json, validationError });
  }, []);

  const handleEvalFormRegenerate = useCallback(() => {
    void handleCreateEvaluationForm();
  }, [handleCreateEvaluationForm]);

  const handleEvalFormDeploy = useCallback(() => {
    setDeployModalState({ status: "confirming" });
  }, []);

  const handleDeployConfirm = useCallback(async () => {
    setDeployModalState({ status: "creating" });

    try {
      const currentJson = evalFormJsonRef.current;
      const parsed = JSON.parse(currentJson);
      const processed = replaceRefIds(parsed) as Record<string, unknown>;

      const { evaluationFormId } = await createEvaluationForm({
        instanceId: instanceId!,
        title: processed.Title as string,
        description: processed.Description as string,
        items: processed.Items as unknown[],
        credentials: credentials!,
        region: region!,
      });

      setDeployModalState({ status: "activating", formId: evaluationFormId });

      await activateEvaluationForm({
        instanceId: instanceId!,
        evaluationFormId,
        evaluationFormVersion: 1,
        credentials: credentials!,
        region: region!,
      });

      setDeployModalState({ status: "success", formId: evaluationFormId });
      setEvalFormState({ status: "success", formId: evaluationFormId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deployment failed";
      setDeployModalState((prev) => {
        if (prev?.status === "activating") {
          return { status: "error", step: "activate", error: message, formId: prev.formId };
        }
        return { status: "error", step: "create", error: message };
      });
    }
  }, [instanceId, credentials, region]);

  const handleDeployRetry = useCallback(async () => {
    if (deployModalState?.status === "error") {
      if (deployModalState.step === "create") {
        void handleDeployConfirm();
      } else if (deployModalState.step === "activate" && deployModalState.formId) {
        const formId = deployModalState.formId;
        setDeployModalState({ status: "activating", formId });
        try {
          await activateEvaluationForm({
            instanceId: instanceId!,
            evaluationFormId: formId,
            evaluationFormVersion: 1,
            credentials: credentials!,
            region: region!,
          });
          setDeployModalState({ status: "success", formId });
          setEvalFormState({ status: "success", formId });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Activation failed";
          setDeployModalState({ status: "error", step: "activate", error: message, formId });
        }
      }
    }
  }, [deployModalState, instanceId, credentials, region, handleDeployConfirm]);

  const handleDeployModalDismiss = useCallback(() => {
    setDeployModalState(null);
  }, []);

  const handleEvalFormDismiss = useCallback(() => {
    setEvalFormState(null);
    setEvalFormActiveTab("conversation");
  }, []);

  // Compute summary for the deploy modal from current JSON
  const deployModalSummary = useMemo(() => {
    const json = evalFormJsonRef.current;
    let formTitle = "Untitled";
    let sectionCount = 0;
    let questionCount = 0;
    try {
      const parsed = JSON.parse(json);
      formTitle = parsed.Title || "Untitled";
      if (Array.isArray(parsed.Items)) {
        sectionCount = parsed.Items.length;
        for (const item of parsed.Items) {
          if (item?.Section?.Items && Array.isArray(item.Section.Items)) {
            questionCount += item.Section.Items.length;
          }
        }
      }
    } catch {
      // leave defaults
    }
    return { formTitle, sectionCount, questionCount };
  }, [evalFormState, deployModalState]);

  // ─── Batch Execution State (Chat) ──────────────────────────────────────────

  const { state: batchState, startBatch, updateIteration, completeBatch, updateConcurrency, reset: resetBatch } = useBatchState();
  const batchAbortRef = useRef<AbortController | null>(null);
  const batchSetConcurrencyRef = useRef<((n: number) => void) | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedIteration, setSelectedIteration] = useState<IterationResult | null>(null);

  // ─── Batch Execution State (Voice) ─────────────────────────────────────────

  const {
    state: voiceBatchState,
    startBatch: startVoiceBatch,
    updateIteration: updateVoiceIteration,
    completeBatch: completeVoiceBatch,
    updateConcurrency: updateVoiceConcurrency,
    reset: resetVoiceBatch,
  } = useBatchState();
  const voiceBatchAbortRef = useRef<AbortController | null>(null);
  const voiceBatchSetConcurrencyRef = useRef<((n: number) => void) | null>(null);
  const [isVoiceBatchStopping, setIsVoiceBatchStopping] = useState(false);
  const [selectedVoiceIteration, setSelectedVoiceIteration] = useState<IterationResult | null>(null);

  // ─── Infrastructure Detection on Mount ───────────────────────────────────

  const setupStatusRef = useRef(state.setupState.status);
  setupStatusRef.current = state.setupState.status;

  useEffect(() => {
    if (!credentials || !instanceId || !region) return;

    // Don't re-run detection if provisioning is in progress or already complete
    if (setupStatusRef.current === "provisioning" || setupStatusRef.current === "ready") return;

    // Always run detection on mount
    const abortController = new AbortController();

    setState((prev) => ({
      ...prev,
      setupState: { ...INITIAL_SETUP_STATE, status: "detecting" },
    }));

    detectInfrastructure({
      credentials,
      region,
      instanceId,
      signal: abortController.signal,
    })
      .then((result) => {
        if (abortController.signal.aborted) return;

        if (result) {
          // Cache the result
          sessionStorage.setItem(
            getStorageKey(instanceId),
            JSON.stringify({ ...result, instanceId })
          );
          setState((prev) => ({
            ...prev,
            setupState: {
              status: "ready",
              currentStep: null,
              completedSteps: [],
              error: null,
              infrastructure: result,
            },
          }));
        } else {
          setState((prev) => ({
            ...prev,
            setupState: {
              ...INITIAL_SETUP_STATE,
              status: "setup-required",
            },
          }));
        }
      })
      .catch((err: unknown) => {
        if (abortController.signal.aborted) return;

        reportError(err);
        const message = err instanceof Error ? err.message : "Detection failed";
        const isPermissionError =
          err instanceof Error && err.name === "AccessDeniedException";

        setState((prev) => ({
          ...prev,
          setupState: {
            status: "error",
            currentStep: null,
            completedSteps: [],
            error: {
              step: "detection",
              message,
              isPermissionError,
            },
            infrastructure: null,
          },
        }));
      });

    return () => {
      abortController.abort();
    };
  }, [credentials, instanceId, region]);

  // ─── Provisioning ────────────────────────────────────────────────────────

  const handleStartProvisioning = useCallback(async () => {
    if (!credentials || !instanceId || !region || !assistantArn) return;

    // Derive domainArn from assistantArn
    const domainArn = assistantArn.replace(":assistant/", ":domain/");

    setState((prev) => ({
      ...prev,
      setupState: {
        ...prev.setupState,
        status: "provisioning",
        error: null,
        currentStep: null,
        completedSteps: [],
      },
    }));

    try {
      const result = await provisionInfrastructure({
        credentials,
        region,
        instanceId,
        assistantArn,
        domainArn,
        onStepChange: (step) => {
          setState((prev) => ({
            ...prev,
            setupState: {
              ...prev.setupState,
              currentStep: step,
              completedSteps: prev.setupState.currentStep
                ? [...prev.setupState.completedSteps, prev.setupState.currentStep]
                : prev.setupState.completedSteps,
            },
          }));
        },
      });

      // Mark last step as complete
      setState((prev) => ({
        ...prev,
        setupState: {
          status: "ready",
          currentStep: null,
          completedSteps: [
            "create-bot",
            "create-locale",
            "create-intent",
            "build-locale",
            "create-version",
            "create-alias",
            "tag-bot",
            "associate-bot",
            "create-flow",
          ],
          error: null,
          infrastructure: result,
        },
      }));

      // Cache the result
      const storageKey = getStorageKey(instanceId);
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ ...result, instanceId })
      );
    } catch (err: unknown) {
      reportError(err);
      const message = err instanceof Error ? err.message : "Provisioning failed";
      const isPermissionError =
        err instanceof Error && err.name === "AccessDeniedException";

      setState((prev) => ({
        ...prev,
        setupState: {
          ...prev.setupState,
          status: "error",
          error: {
            step: prev.setupState.currentStep ?? "create-bot",
            message,
            isPermissionError,
          },
        },
      }));
    }
  }, [credentials, instanceId, region, assistantArn]);

  // ─── Chat Lifecycle ──────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const { inputValue, selectedAgent, setupState, chatState } = state;

    if (!isValidMessage(inputValue)) return;
    if (!selectedAgent) return;
    if (!credentials || !region || !instanceId) return;
    if (!setupState.infrastructure) return;

    const trimmedMessage = inputValue;
    setSendError(null);

    // Clear input immediately
    setState((prev) => ({ ...prev, inputValue: "" }));

    if (chatState === "connected") {
      // Send on existing session
      const connectionToken = chatSessionRef.current?.connectionToken;
      if (!connectionToken) return;

      // Add customer message to the conversation immediately
      const customerMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "customer",
        content: trimmedMessage,
        timestamp: new Date(),
      };
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, customerMessage],
      }));

      try {
        await sendMessage(connectionToken, trimmedMessage, region, credentials);
      } catch (err: unknown) {
        reportError(err);
        const message = err instanceof Error ? err.message : "Failed to send message";
        setSendError(message);
        // Retain message in input on failure
        setState((prev) => ({ ...prev, inputValue: trimmedMessage }));
      }
    }
  }, [state, credentials, region, instanceId]);

  // ─── New Conversation ────────────────────────────────────────────────────

  const handleNewConversation = useCallback(async () => {
    // Disconnect existing session if any
    const connectionToken = chatSessionRef.current?.connectionToken;
    if (connectionToken && region && credentials) {
      void disconnectChat(connectionToken, region, credentials);
    }
    chatSessionRef.current = null;
    setSendError(null);

    // Clear any evaluation form state
    setEvalFormState(null);
    setEvalFormActiveTab("conversation");
    setDeployModalState(null);

    setState((prev) => ({
      ...prev,
      chatState: "idle",
      chatContactId: null,
      messages: [],
      isTyping: false,
      inputValue: "",
    }));

    // Start a new chat session with no initial message (Lex greeting will fire)
    const { selectedAgent, setupState } = state;
    if (!selectedAgent || !credentials || !region || !instanceId) return;
    if (!setupState.infrastructure) return;

    setState((prev) => ({ ...prev, chatState: "connecting" }));

    try {
      const session = await startChat(
        {
          credentials,
          region,
          instanceId,
          contactFlowId: setupState.infrastructure.contactFlowId,
          agentArn: selectedAgent.arn,
        },
        {
          onStateChange: (newState) => {
            setState((prev) => ({ ...prev, chatState: newState }));
          },
          onMessage: (message) => {
            setState((prev) => ({
              ...prev,
              messages: [...prev.messages, message],
              isTyping: false,
            }));
          },
          onTypingStart: () => {
            setState((prev) => ({ ...prev, isTyping: true }));
          },
          onTypingStop: () => {
            setState((prev) => ({ ...prev, isTyping: false }));
          },
          onError: (error) => {
            setSendError(error);
          },
        }
      );

      chatSessionRef.current = session;
      setState((prev) => ({ ...prev, chatContactId: session.contactId }));
    } catch {
      // Error already handled via callbacks
    }
  }, [state, region, credentials, instanceId]);

  // ─── Agent Change ────────────────────────────────────────────────────────

  const handleAgentSelect = useCallback(
    (agent: AIAgent) => {
      const { chatState } = state;
      const isActiveChat =
        chatState === "connecting" || chatState === "connected";

      if (isActiveChat) {
        // Store the candidate and show confirmation modal instead of window.confirm
        setAgentChangeCandidate(agent);
      } else {
        setState((prev) => ({ ...prev, selectedAgent: agent }));
        previousAgentRef.current = agent;
      }
    },
    [state]
  );

  const handleAgentChangeConfirm = useCallback(() => {
    const agent = agentChangeCandidate;
    if (!agent) return;

    const connectionToken = chatSessionRef.current?.connectionToken;
    if (connectionToken) {
      void disconnectChat(connectionToken, region!, credentials!);
    }
    chatSessionRef.current = null;
    setSendError(null);

    setState((prev) => ({
      ...prev,
      selectedAgent: agent,
      chatState: "idle",
      messages: [],
      isTyping: false,
      inputValue: "",
    }));

    previousAgentRef.current = agent;
    setAgentChangeCandidate(null);
  }, [agentChangeCandidate, region, credentials]);

  const handleAgentChangeCancel = useCallback(() => {
    setAgentChangeCandidate(null);
  }, []);

  // ─── Mode Toggle ────────────────────────────────────────────────────────

  const handleModeToggle = useCallback(
    ({ detail }: { detail: { checked: boolean } }) => {
      setState((prev) => ({
        ...prev,
        mode: detail.checked ? "script" : "manual",
      }));
    },
    []
  );

  // ─── Script Execution ────────────────────────────────────────────────────

  const handleRunScript = useCallback(
    (script: TestScript) => {
      const { selectedAgent, setupState } = state;
      if (!selectedAgent || !credentials || !region || !instanceId) return;
      if (!setupState.infrastructure) return;

      // Clear messages and reset state for new script run
      turnLatenciesRef.current = new Map();
      const abortController = new AbortController();
      scriptAbortRef.current = abortController;

      // Clear previous metrics panel
      setChatScriptTranscript(null);

      setState((prev) => ({
        ...prev,
        messages: [],
        isTyping: false,
        scriptRunning: true,
        scriptProgress: null,
        scriptCompletionSummary: null,
      }));

      runScript(
        {
          script,
          agentArn: selectedAgent.arn,
          credentials,
          region,
          instanceId,
          contactFlowId: setupState.infrastructure.contactFlowId,
          settleDurationMs: chatSettleDurationMs,
        },
        {
          onProgress: (progress) => {
            setState((prev) => ({ ...prev, scriptProgress: progress }));
          },
          onSessionStart: (contactId) => {
            setState((prev) => ({ ...prev, chatContactId: contactId }));
          },
          onTurnComplete: (turn: TurnTranscript) => {
            // Store latency for this turn index
            turnLatenciesRef.current.set(turn.turnIndex, turn.latencyMs);
          },
          onMessage: (message) => {
            setState((prev) => ({
              ...prev,
              messages: [...prev.messages, message],
              isTyping: false,
            }));
          },
          onTypingStart: () => {
            setState((prev) => ({ ...prev, isTyping: true }));
          },
          onTypingStop: () => {
            setState((prev) => ({ ...prev, isTyping: false }));
          },
          onComplete: (transcript: ConversationTranscript) => {
            // Store full transcript for metrics panel
            setChatScriptTranscript(transcript);

            // Build system banner message
            const bannerContent = `✓ ${transcript.terminationReason} — ${transcript.turnsCompleted}/${transcript.turnsTotal} turns — ${(transcript.totalDurationMs / 1000).toFixed(1)}s`;
            const bannerMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: "system",
              content: bannerContent,
              timestamp: new Date(),
            };

            setState((prev) => {
              // Append latency info to agent messages
              const updatedMessages = prev.messages.map((msg, idx) => {
                if (msg.role === "agent") {
                  // Count agent messages up to this index to determine turn index
                  let agentCount = 0;
                  for (let i = 0; i <= idx; i++) {
                    if (prev.messages[i]?.role === "agent") {
                      agentCount++;
                    }
                  }
                  const turnIndex = agentCount - 1;
                  // Skip latency for turn 0 — it includes connection setup, not agent response time
                  if (turnIndex === 0) return msg;
                  const latency = turnLatenciesRef.current.get(turnIndex);
                  if (latency !== undefined) {
                    return {
                      ...msg,
                      content: `${msg.content}\n\n⏱ ${latency}ms`,
                    };
                  }
                }
                return msg;
              });

              return {
                ...prev,
                messages: [...updatedMessages, bannerMessage],
                scriptRunning: false,
                isTyping: false,
                scriptCompletionSummary: {
                  terminationReason: transcript.terminationReason,
                  totalDurationMs: transcript.totalDurationMs,
                },
              };
            });
          },
          onError: (error) => {
            setSendError(error);
          },
        },
        abortController.signal
      );
    },
    [state, credentials, region, instanceId, chatSettleDurationMs]
  );

  const handleStopScript = useCallback(() => {
    if (scriptAbortRef.current) {
      scriptAbortRef.current.abort();
    }
  }, []);

  // ─── Voice Script Execution ──────────────────────────────────────────────

  // Fetch voices when voice + script mode is enabled
  useEffect(() => {
    if (state.channel === "voice" && state.mode === "script" && credentials && voices.length === 0 && !voicesLoading) {
      setVoicesLoading(true);
      setVoicesError(null);

      fetchAvailableVoices({ credentials })
        .then((fetchedVoices) => {
          setVoices(fetchedVoices);
          // Default to Ruth (en-US) if available
          const ruth = fetchedVoices.find(
            (v) => v.voiceId === "Ruth" && v.languageCode === "en-US"
          );
          const defaultVoice = ruth ?? fetchedVoices[0];
          if (defaultVoice) {
            setSelectedVoice({
              label: `${defaultVoice.name} (${defaultVoice.gender})`,
              value: defaultVoice.voiceId,
              description: defaultVoice.languageName,
            });
          }
        })
        .catch((err) => {
          reportError(err);
          setVoicesError(
            err instanceof Error ? err.message : "Failed to fetch voices"
          );
        })
        .finally(() => {
          setVoicesLoading(false);
        });
    }
  }, [state.channel, state.mode, credentials, voices.length, voicesLoading]);

  const handleRunVoiceScript = useCallback(
    (script: TestScript) => {
      const { selectedAgent, setupState } = state;
      if (!selectedAgent || !credentials || !region || !instanceId) return;
      if (!setupState.infrastructure) return;

      setVoiceScriptRunning(true);
      setVoiceScriptProgress(null);
      setVoiceSynthesisProgress(null);
      setVoiceScriptCompletionSummary(null);
      setVoiceScriptTranscript(null);

      const abortController = new AbortController();
      voiceScriptAbortRef.current = abortController;

      // Phase 1: Pre-generate Polly audio, then execute the call
      const utterances = script.turns.map((t) => t.customer);
      const synthesisStart = Date.now();

      synthesizeAll({
        utterances,
        credentials,
        region,
        voiceId: selectedVoice?.value ?? "Ruth",
        engine: (voices.find((v) => v.voiceId === (selectedVoice?.value ?? "Ruth"))?.engine ?? "generative") as "generative" | "neural" | "standard",
        signal: abortController.signal,
        onProgress: (progress) => {
          setVoiceSynthesisProgress({ current: progress.currentIndex + 1, total: progress.totalCount });
        },
      })
        .then((result) => {
          const synthesisDurationMs = Date.now() - synthesisStart;
          setVoiceSynthesisProgress(null);

          // Phase 2: Execute the voice script with pre-generated buffers
          return runVoiceScript(
            {
              script,
              agentArn: selectedAgent.arn,
              credentials,
              region,
              instanceId,
              contactFlowId: setupState.infrastructure!.contactFlowId,
              utteranceBuffers: new Map(utterances.map((u, i) => [u, result.buffers[i]!])),
              silenceDurationMs: silenceThresholdMs,
              mockMicrophone: true,
            },
            {
              onProgress: (progress) => {
                setVoiceScriptProgress(progress);
                // Customer audio starts at the beginning of each turn
                setVoiceCustomerStreaming(true);
              },
              onSessionStart: () => {
                // Call connected — synthesis progress already cleared
              },
              onCustomerAudioEnd: () => {
                setVoiceCustomerStreaming(false);
              },
              onAgentAudioStart: () => {
                // Agent started speaking — waveform handled by voiceCustomerStreaming being false
              },
              onTurnComplete: () => {
                // Agent finished responding — switch waveform back to waiting state
                setVoiceCustomerStreaming(false);
              },
              onComplete: (transcript) => {
                setVoiceScriptRunning(false);
                setVoiceCustomerStreaming(false);
                setVoiceScriptTranscript(transcript);
                setVoiceScriptCompletionSummary({
                  terminationReason: transcript.terminationReason,
                  totalDurationMs: transcript.totalDurationMs,
                  synthesisDurationMs,
                });
              },
              onError: () => {
                // Error is captured in the transcript terminationReason
              },
            },
            abortController.signal
          );
        })
        .catch((err: unknown) => {
          // Don't report aborts — those are user-initiated stops
          if (err instanceof Error && err.name !== "AbortError") {
            reportError(err);
          }
          setVoiceScriptRunning(false);
        });
    },
    [state, credentials, region, instanceId, silenceThresholdMs]
  );

  const handleStopVoiceScript = useCallback(() => {
    if (voiceScriptAbortRef.current) {
      voiceScriptAbortRef.current.abort();
    }
  }, []);

  // ─── Voice Batch Execution ───────────────────────────────────────────────

  const handleRunVoiceBatch = useCallback(
    (script: TestScript, iterationCount: number, concurrency: number) => {
      const { selectedAgent, setupState } = state;
      if (!selectedAgent || !credentials || !region || !instanceId) return;
      if (!setupState.infrastructure) return;

      const voiceId = selectedVoice?.value ?? "Ruth";
      // Determine engine from the selected voice in the voices list
      const matchedVoice = voices.find((v) => v.voiceId === voiceId);
      const engine = matchedVoice?.engine ?? "generative";

      const scriptHasVariations = script.turns.some(
        (t) => Array.isArray(t.variations) && t.variations.length > 0
      );

      const config: VoiceBatchConfig = {
        script,
        iterationCount,
        concurrencyLimit: concurrency,
        agentArn: selectedAgent.arn,
        credentials,
        region,
        instanceId,
        contactFlowId: setupState.infrastructure.contactFlowId,
        voiceId,
        engine,
        silenceDurationMs: silenceThresholdMs,
        useVariations: scriptHasVariations,
      };

      // Reset stopping state and selected iteration
      setIsVoiceBatchStopping(false);
      setSelectedVoiceIteration(null);

      // Initialize batch state
      startVoiceBatch({
        script,
        iterationCount,
        concurrencyLimit: concurrency,
        agentArn: selectedAgent.arn,
        credentials,
        region,
        instanceId,
        contactFlowId: setupState.infrastructure.contactFlowId,
      });

      // Pre-populate all iterations as "queued" so they appear in the table immediately
      for (let i = 1; i <= iterationCount; i++) {
        updateVoiceIteration({
          iterationNumber: i,
          status: "queued",
          durationMs: 0,
          turnsCompleted: 0,
          turnsTotal: script.turns.length,
          retryCount: 0,
        });
      }

      // Create a new AbortController for this batch
      const controller = new AbortController();
      voiceBatchAbortRef.current = controller;

      // Run the voice batch with callbacks wired to useBatchState
      const { promise, setConcurrency } = runVoiceBatch(
        config,
        {
          onIterationStart: (iterationNumber) => {
            updateVoiceIteration({
              iterationNumber,
              status: "running",
              durationMs: 0,
              turnsCompleted: 0,
              turnsTotal: script.turns.length,
              retryCount: 0,
            });
          },
          onIterationComplete: (result) => {
            updateVoiceIteration(result);
          },
          onProgressUpdate: () => {
            // Progress is derived from voiceBatchState iterations
          },
          onTurnComplete: (iterationNumber, turnsCompleted) => {
            updateVoiceIteration({
              iterationNumber,
              status: "running",
              durationMs: 0,
              turnsCompleted,
              turnsTotal: script.turns.length,
              retryCount: 0,
            });
          },
          onBatchComplete: (stats) => {
            completeVoiceBatch(stats);
            setIsVoiceBatchStopping(false);
          },
          onError: (_iterationNumber, error) => {
            // Report auth/access errors as app-level banner
            reportError(error);
          },
        },
        controller.signal
      );
      voiceBatchSetConcurrencyRef.current = setConcurrency;
      void promise;
    },
    [state, credentials, region, instanceId, selectedVoice, voices, silenceThresholdMs, startVoiceBatch, updateVoiceIteration, completeVoiceBatch]
  );

  const handleStopVoiceBatch = useCallback(() => {
    if (voiceBatchAbortRef.current) {
      voiceBatchAbortRef.current.abort();
      setIsVoiceBatchStopping(true);
    }
  }, []);

  const handleVoiceBatchConcurrencyChange = useCallback((n: number) => {
    voiceBatchSetConcurrencyRef.current?.(n);
    updateVoiceConcurrency(n);
  }, [updateVoiceConcurrency]);

  const handleDismissVoiceBatch = useCallback(() => {
    resetVoiceBatch();
    voiceBatchSetConcurrencyRef.current = null;
  }, [resetVoiceBatch]);

  const handleVoiceBatchExport = useCallback(() => {
    if (!voiceBatchState) return;
    const payload = buildExportPayload(voiceBatchState);
    const filename = generateExportFilename(voiceBatchState.scriptName, voiceBatchState.startTimestamp);
    downloadJson(payload, filename);
  }, [voiceBatchState]);

  // ─── Batch Execution ─────────────────────────────────────────────────────

  const handleRunBatch = useCallback(
    (script: TestScript, iterationCount: number, concurrency: number) => {
      const { selectedAgent, setupState } = state;
      if (!selectedAgent || !credentials || !region || !instanceId) return;
      if (!setupState.infrastructure) return;

      // Derive useVariations directly from the script being run — avoids
      // any stale-closure issue with the derived parsedScript state.
      const scriptHasVariations = script.turns.some(
        (t) => Array.isArray(t.variations) && t.variations.length > 0
      );

      const config: BatchConfig = {
        script,
        iterationCount,
        concurrencyLimit: concurrency,
        agentArn: selectedAgent.arn,
        credentials,
        region,
        instanceId,
        contactFlowId: setupState.infrastructure.contactFlowId,
        useVariations: scriptHasVariations,
        settleDurationMs: chatSettleDurationMs,
      };

      // Reset stopping state and selected iteration
      setIsStopping(false);
      setSelectedIteration(null);

      // Initialize batch state
      startBatch(config);

      // Pre-populate all iterations as "queued" so they appear in the table immediately
      for (let i = 1; i <= iterationCount; i++) {
        updateIteration({
          iterationNumber: i,
          status: "queued",
          durationMs: 0,
          turnsCompleted: 0,
          turnsTotal: script.turns.length,
          retryCount: 0,
        });
      }

      // Create a new AbortController for this batch
      const controller = new AbortController();
      batchAbortRef.current = controller;

      // Run the batch with callbacks wired to useBatchState
      const { promise, setConcurrency } = runBatch(
        config,
        {
          onIterationStart: (iterationNumber) => {
            updateIteration({
              iterationNumber,
              status: "running",
              durationMs: 0,
              turnsCompleted: 0,
              turnsTotal: script.turns.length,
              retryCount: 0,
            });
          },
          onIterationComplete: (result) => {
            updateIteration(result);
          },
          onProgressUpdate: () => {
            // Progress is derived from batchState iterations — no extra action needed
          },
          onBatchComplete: (stats) => {
            completeBatch(stats);
            setIsStopping(false);
          },
          onError: (_iterationNumber, error) => {
            // Report auth/access errors as app-level banner
            reportError(error);
          },
        },
        controller.signal
      );
      batchSetConcurrencyRef.current = setConcurrency;
      void promise;
    },
    [state, credentials, region, instanceId, chatSettleDurationMs, startBatch, updateIteration, completeBatch]
  );

  const handleStopAll = useCallback(() => {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
      setIsStopping(true);
    }
  }, []);

  const handleConcurrencyChange = useCallback((n: number) => {
    batchSetConcurrencyRef.current?.(n);
    updateConcurrency(n);
  }, [updateConcurrency]);

  const handleDismissBatch = useCallback(() => {
    resetBatch();
    batchSetConcurrencyRef.current = null;
  }, [resetBatch]);

  const handleExport = useCallback(() => {
    if (!batchState) return;
    const payload = buildExportPayload(batchState);
    const filename = generateExportFilename(batchState.scriptName, batchState.startTimestamp);
    downloadJson(payload, filename);
  }, [batchState]);

  // ─── Modal Handlers ──────────────────────────────────────────────────────

  const handleStatusButtonClick = useCallback(() => {
    const { setupState } = state;
    if (setupState.status === "ready") {
      setModalMode("read-only");
    } else {
      setModalMode("provisioning");
    }
    setState((prev) => ({ ...prev, isModalVisible: true }));
  }, [state]);

  const handleModalDismiss = useCallback(() => {
    setState((prev) => ({ ...prev, isModalVisible: false }));
  }, []);

  const handleRetry = useCallback(() => {
    void handleStartProvisioning();
  }, [handleStartProvisioning]);

  // ─── Input Handlers ──────────────────────────────────────────────────────

  const handleInputChange = useCallback((value: string) => {
    setState((prev) => ({ ...prev, inputValue: value }));
  }, []);

  const handleSendClick = useCallback(() => {
    void handleSend();
  }, [handleSend]);

  // ─── Derived State ───────────────────────────────────────────────────────

  const isInfraReady = state.setupState.status === "ready";
  const isNotReady = !isInfraReady || !state.selectedAgent;
  const isModeToggleDisabled =
    isNotReady || state.scriptRunning || state.chatState === "connecting";
  const isVoiceModeToggleDisabled = isNotReady || voiceCallActive || voiceScriptRunning;
  // True while a batch is in-flight (running or stopping) — hides chat panel, locks controls
  const isBatchRunning =
    batchState != null &&
    (batchState.status === "running" || batchState.status === "stopping");
  // True when batch results are visible (running, stopping, or completed)
  const isBatchActive = batchState != null && batchState.status !== "idle";

  // Voice batch derived state
  const isVoiceBatchRunning =
    voiceBatchState != null &&
    (voiceBatchState.status === "running" || voiceBatchState.status === "stopping");
  const isVoiceBatchActive = voiceBatchState != null && voiceBatchState.status !== "idle";

  // ─── Save as Script ──────────────────────────────────────────────────────

  const [saveScriptModalVisible, setSaveScriptModalVisible] = useState(false);
  const [saveScriptName, setSaveScriptName] = useState("Untitled script");

  const handleSaveAsScript = useCallback(() => {
    const { messages } = state;
    const customerMessages = messages.filter((m) => m.role === "customer");
    if (customerMessages.length === 0) return;
    setSaveScriptName("Untitled script");
    setSaveScriptModalVisible(true);
  }, [state]);

  const handleSaveScriptConfirm = useCallback(() => {
    const { messages } = state;
    const name = saveScriptName.trim() || "Untitled script";

    // Build turns from customer messages (settle timer handles multi-response detection automatically)
    const turns: { customer: string }[] = [];
    const realMessages = messages.filter((m) => m.role !== "system");

    for (let i = 0; i < realMessages.length; i++) {
      const msg = realMessages[i]!;
      if (msg.role === "customer") {
        turns.push({ customer: msg.content });
      }
    }

    const script = { name, turns };
    const yaml = formatTestScript(script);
    const fileName = name.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase() || "test-script";

    // Download the file
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setSaveScriptModalVisible(false);
  }, [state, saveScriptName]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Test Amazon Connect AI Agents via chat or voice, run scripted test scenarios, and execute batch tests at scale.">
          AI Agent Testing
        </Header>
      }
    >
      <SpaceBetween size="l">
        {/* Agent Selector — shared between chat and voice channels */}
        {(state.channel === "chat" || state.channel === "voice") && credentials && region && (
          <div style={{ maxWidth: "320px" }}>
            <AgentSelector
              credentials={credentials}
              region={region}
              assistantId={assistantId}
              isReady={isInfraReady}
              onSelect={handleAgentSelect}
              selectedAgent={state.selectedAgent}
            />
          </div>
        )}

        {/* Chat Panel — messages always visible, input hidden in script mode */}
        {/* Hidden via CSS (not unmounted) when voice channel is active to preserve state */}
        {/* Hidden while a batch is actively running/stopping; visible again once completed/dismissed */}
        <div style={{ display: state.channel === "chat" && !isBatchRunning ? undefined : "none" }}>
          <ChatPanel
            messages={state.messages}
            chatState={state.chatState}
            contactId={state.chatContactId}
            isTyping={state.isTyping}
            inputValue={state.inputValue}
            onInputChange={handleInputChange}
            onSend={handleSendClick}
            onNewConversation={handleNewConversation}
            onSaveAsScript={handleSaveAsScript}
            agentName={state.selectedAgent?.name}
            sendError={sendError}
            disabled={!isInfraReady || !state.selectedAgent}
            hideInput={state.mode === "script" && isBatchActive}
            hideNewConversation={state.mode === "script" || isBatchActive}
            evaluationFormPanel={
              evalFormState !== null ? (
                <EvaluationFormTab
                  state={evalFormState}
                  onJsonChange={handleEvalFormJsonChange}
                  onRefine={handleRefine}
                  onRegenerate={handleEvalFormRegenerate}
                  onDeploy={handleEvalFormDeploy}
                  onDismiss={handleEvalFormDismiss}
                />
              ) : undefined
            }
            evaluationFormTabActive={evalFormActiveTab === "evaluation-form"}
            onTabChange={setEvalFormActiveTab}
            onCreateEvaluationForm={handleCreateEvaluationForm}
          />
        </div>

        {/* Voice Panel — rendered when voice channel is active */}
        {state.channel === "voice" && (
          <VoicePanel
            selectedAgent={state.selectedAgent}
            setupState={state.setupState}
            credentials={credentials}
            region={region ?? ""}
            instanceId={instanceId}
            scriptMode={state.mode === "script"}
            onCallActiveChange={setVoiceCallActive}
            synthesisProgress={voiceSynthesisProgress}
            voiceScriptRunning={voiceScriptRunning}
            voiceCustomerStreaming={voiceCustomerStreaming}
          />
        )}

        {/* Script Metrics Panel — chat (shown after single script run completes) */}
        {state.channel === "chat" && state.mode === "script" && chatScriptTranscript && (
          <ScriptMetricsPanel
            chatTranscript={chatScriptTranscript}
            onDismiss={() => setChatScriptTranscript(null)}
          />
        )}

        {/* Script Metrics Panel — voice (shown after single script run completes) */}
        {state.channel === "voice" && state.mode === "script" && voiceScriptTranscript && (
          <ScriptMetricsPanel
            voiceTranscript={voiceScriptTranscript}
            synthesisDurationMs={voiceScriptCompletionSummary?.synthesisDurationMs}
            onDismiss={() => setVoiceScriptTranscript(null)}
          />
        )}

        {/* Batch Execution UI — RunOverviewPanel + BatchResultsTable + Chart */}
        {state.channel === "chat" && isBatchActive && batchState && (
          <SpaceBetween size="l">
            <RunOverviewPanel
              state={batchState}
              onStopAll={handleStopAll}
              isStopping={isStopping}
              onConcurrencyChange={handleConcurrencyChange}
              onDismiss={handleDismissBatch}
            />
            <BatchResultsTable
              iterations={batchState.iterations}
              batchCompleted={batchState.status === "completed"}
              onRowClick={(result) => setSelectedIteration(result)}
              onExport={handleExport}
            />
          </SpaceBetween>
        )}

        {/* Voice Batch Execution UI — RunOverviewPanel + BatchResultsTable */}
        {state.channel === "voice" && isVoiceBatchActive && voiceBatchState && (
          <SpaceBetween size="l">
            <RunOverviewPanel
              state={voiceBatchState}
              onStopAll={handleStopVoiceBatch}
              isStopping={isVoiceBatchStopping}
              onConcurrencyChange={handleVoiceBatchConcurrencyChange}
              onDismiss={handleDismissVoiceBatch}
            />
            <BatchResultsTable
              iterations={voiceBatchState.iterations}
              batchCompleted={voiceBatchState.status === "completed"}
              onRowClick={(result) => setSelectedVoiceIteration(result)}
              onExport={handleVoiceBatchExport}
            />
          </SpaceBetween>
        )}

        {/* Status Button (left) + Channel Toggle (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <StatusButton
            setupState={state.setupState}
            onClick={handleStatusButtonClick}
          />
          <SegmentedControl
            selectedId={state.channel}
            onChange={({ detail }) =>
              setState((prev) => ({
                ...prev,
                channel: detail.selectedId as "chat" | "voice",
              }))
            }
            options={[
              { text: "Chat", id: "chat" },
              { text: "Voice", id: "voice" },
            ]}
          />
        </div>

        {/* Script Mode Toggle — below channel selector, right-aligned */}
        {(state.channel === "chat" || state.channel === "voice") && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Toggle
              onChange={handleModeToggle}
              checked={state.mode === "script"}
              disabled={
                state.channel === "chat"
                  ? isModeToggleDisabled
                  : isVoiceModeToggleDisabled
              }
            >
              Script Mode
            </Toggle>
          </div>
        )}

        {/* Script Input Panel — below the toggle (chat) */}
        {state.channel === "chat" && state.mode === "script" && (
          <>
            {/* Settle Duration */}
            <FormField
              label={
                <span>
                  Settle duration{" "}
                  <HelpIcon anchorId="settle-duration" pageId="testing" fieldName="Settle duration" />
                </span>
              }
              description={`${chatSettleDurationInput}s wait for additional agent messages before advancing`}
            >
              <Slider
                value={chatSettleDurationMs / 1000}
                onChange={({ detail }) => {
                  const val = detail.value;
                  setChatSettleDurationMs(Math.round(val * 1000));
                  setChatSettleDurationInput(String(val));
                }}
                min={1}
                max={10}
                step={0.5}
                disabled={isNotReady || state.scriptRunning}
                ariaLabel="Settle duration in seconds"
              />
            </FormField>
            <ScriptInputPanel
              onRunScript={handleRunScript}
              onRunBatch={handleRunBatch}
              onStop={handleStopScript}
              isRunning={state.scriptRunning}
              isBatchExecuting={isBatchRunning}
              progress={state.scriptProgress}
              completionSummary={state.scriptCompletionSummary}
              hasAgent={state.selectedAgent !== null}
              disabled={isNotReady}
              batchActive={isBatchRunning}
              isGenerating={isGenerating}
              onGenerateVariations={handleGenerateVariations}
              onCancelGeneration={handleCancelGeneration}
              onExportEnrichedScript={handleExportEnrichedScript}
              generationSummary={generationSummary}
              parsedScript={parsedScript}
              onParsedScriptChange={handleParsedScriptChange}
            />
          </>
        )}

        {/* Script Input Panel — below the toggle (voice) */}
        {state.channel === "voice" && state.mode === "script" && (
          <>
            {/* Voice Selector */}
            {voicesError && (
              <StatusIndicator type="error">{voicesError}</StatusIndicator>
            )}
            <FormField
              label={
                <span>
                  Customer voice{" "}
                  <HelpIcon anchorId="voice-selection" pageId="testing" fieldName="Customer voice" />
                </span>
              }
              description="The Polly voice used to generate customer audio for scripted turns."
            >
              <Select
                selectedOption={selectedVoice}
                onChange={({ detail }) =>
                  setSelectedVoice(detail.selectedOption as SelectProps.Option)
                }
                options={buildVoiceOptionGroups(voices)}
                placeholder="Select a voice"
                loadingText="Loading voices..."
                statusType={voicesLoading ? "loading" : undefined}
                disabled={isNotReady || voiceScriptRunning || voicesLoading}
                ariaLabel="Polly voice selector"
              />
            </FormField>
            {/* Silence Threshold */}
            <FormField
              label={
                <span>
                  Silence threshold{" "}
                  <HelpIcon anchorId="silence-threshold" pageId="testing" fieldName="Silence threshold" />
                </span>
              }
              description={`${silenceThresholdInput}s of silence before advancing to next turn`}
            >
              <Slider
                value={silenceThresholdMs / 1000}
                onChange={({ detail }) => {
                  const val = detail.value;
                  setSilenceThresholdMs(Math.round(val * 1000));
                  setSilenceThresholdInput(String(val));
                }}
                min={2}
                max={15}
                step={0.5}
                disabled={isNotReady || voiceScriptRunning}
                ariaLabel="Silence threshold in seconds"
              />
            </FormField>
            <ScriptInputPanel
              onRunScript={handleRunVoiceScript}
              onRunBatch={handleRunVoiceBatch}
              onStop={isVoiceBatchRunning ? handleStopVoiceBatch : handleStopVoiceScript}
              isRunning={voiceScriptRunning}
              isBatchExecuting={isVoiceBatchRunning}
              progress={voiceScriptProgress}
              completionSummary={
                voiceScriptCompletionSummary
                  ? {
                      terminationReason:
                        voiceScriptCompletionSummary.terminationReason === "completed"
                          ? "completed"
                          : voiceScriptCompletionSummary.terminationReason === "user_stopped"
                            ? "user_stopped"
                            : "max_timeout",
                      totalDurationMs: voiceScriptCompletionSummary.totalDurationMs,
                      synthesisDurationMs: voiceScriptCompletionSummary.synthesisDurationMs,
                    }
                  : null
              }
              hasAgent={state.selectedAgent !== null}
              disabled={isNotReady}
              batchActive={isVoiceBatchRunning}
              isGenerating={isGenerating}
              onGenerateVariations={handleGenerateVariations}
              onCancelGeneration={handleCancelGeneration}
              onExportEnrichedScript={handleExportEnrichedScript}
              generationSummary={generationSummary}
              parsedScript={parsedScript}
              onParsedScriptChange={handleParsedScriptChange}
            />
          </>
        )}
      </SpaceBetween>

      {/* Setup Modal */}
      <SetupModal
        visible={state.isModalVisible}
        onDismiss={handleModalDismiss}
        mode={modalMode}
        setupState={state.setupState}
        onStartProvisioning={() => void handleStartProvisioning()}
        onRetry={handleRetry}
        instanceId={instanceId}
      />

      {/* Save as Script Modal */}
      <Modal
        visible={saveScriptModalVisible}
        onDismiss={() => setSaveScriptModalVisible(false)}
        header="Save as Script"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setSaveScriptModalVisible(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveScriptConfirm}>
                Save
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField label="Script name" description="Used as both the YAML name field and the filename.">
          <Input
            value={saveScriptName}
            onChange={({ detail }) => setSaveScriptName(detail.value)}
            placeholder="My test script"
            autoFocus
          />
        </FormField>
      </Modal>

      {/* Agent Change Confirmation Modal */}
      <Modal
        visible={agentChangeCandidate !== null}
        onDismiss={handleAgentChangeCancel}
        header="Change agent?"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleAgentChangeCancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAgentChangeConfirm}>
                Change agent
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        Switching to <strong>{agentChangeCandidate?.name}</strong> will end the current conversation and clear the chat history.
      </Modal>

      {/* Deploy Evaluation Form Modal */}
      <DeployFormModal
        visible={deployModalState !== null}
        onDismiss={handleDeployModalDismiss}
        onConfirm={handleDeployConfirm}
        onRetry={handleDeployRetry}
        state={deployModalState ?? { status: "confirming" }}
        formTitle={deployModalSummary.formTitle}
        sectionCount={deployModalSummary.sectionCount}
        questionCount={deployModalSummary.questionCount}
      />

      {/* Transcript Detail — slide-out panel for batch iteration drill-down */}
      {selectedIteration && (
        <TranscriptDetail
          result={selectedIteration}
          onClose={() => setSelectedIteration(null)}
        />
      )}

      {/* Transcript Detail — slide-out panel for voice batch iteration drill-down */}
      {selectedVoiceIteration && (
        <TranscriptDetail
          result={selectedVoiceIteration}
          onClose={() => setSelectedVoiceIteration(null)}
        />
      )}    </ContentLayout>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build grouped voice options for the Cloudscape Select component.
 * Groups voices by language name.
 */
function buildVoiceOptionGroups(voices: PollyVoice[]): SelectProps.OptionGroup[] {
  const grouped = new Map<string, SelectProps.Option[]>();

  for (const voice of voices) {
    const group = voice.languageName || voice.languageCode;
    if (!grouped.has(group)) {
      grouped.set(group, []);
    }
    grouped.get(group)!.push({
      label: `${voice.name} (${voice.gender})`,
      value: voice.voiceId,
      description: voice.languageCode,
    });
  }

  const groups: SelectProps.OptionGroup[] = [];
  for (const [label, options] of grouped.entries()) {
    groups.push({ label, options });
  }

  // Sort groups alphabetically
  groups.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));

  return groups;
}
