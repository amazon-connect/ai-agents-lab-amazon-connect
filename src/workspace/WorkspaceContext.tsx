// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { useCredentials } from "../credentials/CredentialsContext";
import { useAuth } from "../auth/AuthContext";
import { discoverInstances } from "./connect-client";
import { listAssistants } from "./qconnect-client";
import {
  getStoredWorkspace,
  setStoredWorkspace,
  clearStoredWorkspace,
} from "./workspace-store";
import type {
  WorkspaceContextValue,
  WorkspaceWorkflowState,
  InstanceSummary,
  AssistantSummary,
} from "./types";
import { useAppNotifications } from "../layouts/AppNotificationContext";

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { credentials, refresh: refreshCredentials } = useCredentials();
  const { logout } = useAuth();
  const { reportError } = useAppNotifications();

  const [state, setState] = useState<WorkspaceWorkflowState>("pending");
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [assistants, setAssistants] = useState<AssistantSummary[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<InstanceSummary | null>(null);
  const [selectedAssistant, setSelectedAssistant] = useState<AssistantSummary | null>(null);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const assistantAbortRef = useRef<AbortController | null>(null);

  // --- Helpers ---

  function isCredentialExpiry(err: unknown): boolean {
    if (err instanceof Error) {
      return (
        err.name === "UnauthorizedException" ||
        err.name === "ExpiredTokenException"
      );
    }
    return false;
  }

  // --- Discovery ---

  async function startDiscovery() {
    if (!credentials) return;

    discoveryAbortRef.current?.abort();
    const abortController = new AbortController();
    discoveryAbortRef.current = abortController;

    setState("loading-instances");
    setInstancesLoading(true);
    setInstances([]);
    setAssistants([]);
    setSelectedInstance(null);
    setSelectedAssistant(null);
    setError(null);

    try {
      const allInstances = await discoverInstances({
        credentials,
        signal: abortController.signal,
      });

      if (!mountedRef.current || abortController.signal.aborted) return;

      setInstances(allInstances);
      setInstancesLoading(false);

      if (allInstances.length === 0) {
        setError("No Connect instances found in any region.");
        setState("error");
        return;
      }

      // Multiple or single instances — wait for user selection
      setState("selecting");
    } catch (err: unknown) {
      if (!mountedRef.current || abortController.signal.aborted) return;

      setInstancesLoading(false);

      if (isCredentialExpiry(err)) {
        await handleCredentialExpiry(() => startDiscovery());
        return;
      }

      reportError(err);
      const message = err instanceof Error ? err.message : "Discovery failed";
      setError(message);
      setState("error");
    }
  }

  // --- Assistants ---

  async function fetchAssistants(instance: InstanceSummary) {
    if (!credentials) return;

    assistantAbortRef.current?.abort();
    const abortController = new AbortController();
    assistantAbortRef.current = abortController;

    setAssistantsLoading(true);
    setAssistants([]);
    setSelectedAssistant(null);

    try {
      const assistantList = await listAssistants({
        credentials,
        region: instance.region,
        signal: abortController.signal,
      });

      if (!mountedRef.current || abortController.signal.aborted) return;

      setAssistants(assistantList);
      setAssistantsLoading(false);

      // Wait for user selection
      setState("selecting");
    } catch (err: unknown) {
      if (!mountedRef.current || abortController.signal.aborted) return;

      setAssistantsLoading(false);

      if (isCredentialExpiry(err)) {
        await handleCredentialExpiry(() => fetchAssistants(instance));
        return;
      }

      reportError(err);
      const message = err instanceof Error ? err.message : "Failed to list assistants";
      setError(message);
      setState("selecting");
    }
  }

  // --- Credential expiry handling ---

  async function handleCredentialExpiry(retryFn: () => Promise<void>) {
    try {
      await refreshCredentials();
      if (!mountedRef.current) return;
      await retryFn();
    } catch (err) {
      if (!mountedRef.current) return;
      reportError(err);
      setError("Session expired. Please re-authenticate.");
      setState("error");
      logout();
    }
  }

  // --- Persist and transition to ready ---

  function persistAndReady(
    instance: InstanceSummary,
    assistant: AssistantSummary
  ) {
    setStoredWorkspace({
      instanceId: instance.instanceId,
      instanceAlias: instance.instanceAlias,
      assistantId: assistant.assistantId,
      assistantName: assistant.name,
      region: instance.region,
    });
    setSelectedInstance(instance);
    setSelectedAssistant(assistant);
    setError(null);
    setState("ready");
  }

  // --- Selection handlers (called from AppShell top nav) ---

  const selectInstance = useCallback((instance: InstanceSummary) => {
    setSelectedInstance(instance);
    setSelectedAssistant(null);
    void fetchAssistants(instance);
  }, [credentials]);

  const selectAssistant = useCallback((assistant: AssistantSummary) => {
    if (!selectedInstance) return;
    setSelectedAssistant(assistant);
    persistAndReady(selectedInstance, assistant);
  }, [selectedInstance]);

  // --- Public actions ---

  const reset = useCallback(() => {
    discoveryAbortRef.current?.abort();
    assistantAbortRef.current?.abort();

    clearStoredWorkspace();
    setInstances([]);
    setAssistants([]);
    setSelectedInstance(null);
    setSelectedAssistant(null);
    setInstancesLoading(false);
    setAssistantsLoading(false);
    setError(null);
    setState("pending");

    void startDiscovery();
  }, [credentials]);

  // --- Background population for restored workspace ---

  async function populateListsForRestoredWorkspace(restoredInstance: InstanceSummary) {
    if (!credentials) return;

    // Fetch instances in the background (don't change state or selection)
    try {
      const abortController = new AbortController();
      discoveryAbortRef.current = abortController;

      const allInstances = await discoverInstances({
        credentials,
        signal: abortController.signal,
      });

      if (!mountedRef.current || abortController.signal.aborted) return;
      setInstances(allInstances);
    } catch {
      // Silently ignore — the user already has a working selection
    }

    // Fetch assistants for the restored instance
    try {
      const abortController = new AbortController();
      assistantAbortRef.current = abortController;

      const assistantList = await listAssistants({
        credentials,
        region: restoredInstance.region,
        signal: abortController.signal,
      });

      if (!mountedRef.current || abortController.signal.aborted) return;
      setAssistants(assistantList);
    } catch {
      // Silently ignore
    }
  }

  // --- Mount logic ---

  useEffect(() => {
    mountedRef.current = true;

    const stored = getStoredWorkspace();

    if (stored) {
      // Reject stale storage that lacks display names
      if (!stored.instanceAlias || !stored.assistantName) {
        clearStoredWorkspace();
        void startDiscovery();
        return;
      }

      const restoredInstance: InstanceSummary = {
        instanceId: stored.instanceId,
        instanceAlias: stored.instanceAlias,
        arn: "",
        instanceStatus: "",
        region: stored.region,
      };
      const restoredAssistant: AssistantSummary = {
        assistantId: stored.assistantId,
        name: stored.assistantName,
        type: "",
        status: "",
        assistantArn: "",
      };

      setSelectedInstance(restoredInstance);
      setSelectedAssistant(restoredAssistant);
      setError(null);
      setState("ready");

      // Populate dropdown lists in the background so the user can change selection
      void populateListsForRestoredWorkspace(restoredInstance);
    } else {
      void startDiscovery();
    }

    return () => {
      mountedRef.current = false;
      discoveryAbortRef.current?.abort();
      assistantAbortRef.current?.abort();
    };
  }, []);

  // --- Context value ---

  const contextValue: WorkspaceContextValue = {
    state,
    instance: selectedInstance,
    assistant: selectedAssistant,
    region: selectedInstance?.region ?? null,
    error,
    instances,
    assistants,
    instancesLoading,
    assistantsLoading,
    selectInstance,
    selectAssistant,
    reset,
  };

  // --- Always render children (gating is handled by AppShell) ---

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Custom hook to access the workspace context.
 * Throws if called outside of a WorkspaceProvider.
 */
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === null) {
    throw new Error(
      "useWorkspace must be used within a WorkspaceProvider"
    );
  }
  return context;
}
