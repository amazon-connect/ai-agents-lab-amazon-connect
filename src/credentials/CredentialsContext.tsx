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

import { useAuth } from "../auth/AuthContext";
import { getToken } from "../auth/token-store";
import { setCredentials, clearCredentials } from "./credential-store";
import {
  getStoredSelection,
  setStoredSelection,
  clearStoredSelection,
} from "./selection-store";
import {
  listAccounts as ssoListAccounts,
  listAccountRoles as ssoListAccountRoles,
  getRoleCredentials as ssoGetRoleCredentials,
} from "./sso-client";
import type {
  AccountInfo,
  AWSCredentials,
  CredentialWorkflowState,
  CredentialsContextValue,
  RoleInfo,
} from "./types";
import { CredentialSetupPage } from "../pages/CredentialSetupPage";
import Spinner from "@cloudscape-design/components/spinner";

/** How far before expiry (ms) to trigger auto-refresh. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

const CredentialsContext = createContext<CredentialsContextValue | null>(null);

export function CredentialsProvider({ children, onRefreshError }: { children: ReactNode; onRefreshError?: (err: unknown) => void }) {
  const { logout } = useAuth();

  const [state, setState] = useState<CredentialWorkflowState>("pending");  const [credentials, setCredsState] = useState<AWSCredentials | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Setup page state
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [credentialLoading, setCredentialLoading] = useState(false);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const region = import.meta.env.VITE_AWS_REGION as string;

  // --- Helpers ---

  function clearRefreshTimer() {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }

  function scheduleRefresh(expiration: number) {
    clearRefreshTimer();
    const delay = expiration - Date.now() - REFRESH_BUFFER_MS;
    if (delay <= 0) {
      // Expiration is within 5 minutes or already past — refresh immediately
      void performRefresh();
    } else {
      refreshTimerRef.current = setTimeout(() => {
        void performRefresh();
      }, delay);
    }
  }

  async function performRefresh() {
    const token = getToken();
    if (!token || !accountId || !roleName) return;

    try {
      const creds = await ssoGetRoleCredentials(token, accountId, roleName, region);
      if (!mountedRef.current) return;
      setCredentials(creds);
      setCredsState(creds);
      scheduleRefresh(creds.expiration);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      onRefreshError?.(err);
      const message = err instanceof Error ? err.message : "Credential refresh failed";
      setError(message);
      setState("error");
    }
  }

  function transitionToReady(
    creds: AWSCredentials,
    selectedAccountId: string,
    selectedRoleName: string
  ) {
    setCredentials(creds);
    setCredsState(creds);
    setAccountId(selectedAccountId);
    setRoleName(selectedRoleName);
    setStoredSelection(selectedAccountId, selectedRoleName);
    setError(null);
    setState("ready");
    scheduleRefresh(creds.expiration);
  }

  function transitionToPending() {
    clearRefreshTimer();
    clearCredentials();
    setCredsState(null);
    setError(null);
    setState("pending");
  }

  // --- Public actions ---

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token || !accountId || !roleName) return;

    setState("loading");
    setError(null);
    try {
      const creds = await ssoGetRoleCredentials(token, accountId, roleName, region);
      if (!mountedRef.current) return;
      setCredentials(creds);
      setCredsState(creds);
      setState("ready");
      scheduleRefresh(creds.expiration);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      onRefreshError?.(err);
      const message = err instanceof Error ? err.message : "Credential refresh failed";
      setError(message);
      setState("error");
    }
  }, [accountId, roleName, region]);

  const reset = useCallback(() => {
    clearRefreshTimer();
    clearCredentials();
    clearStoredSelection();
    setCredsState(null);
    setAccountId(null);
    setRoleName(null);
    setError(null);
    setAccounts([]);
    setRoles([]);
    setState("pending");
    // Re-trigger account listing
    void loadAccounts();
  }, []);

  // --- Setup page callbacks ---

  async function loadAccounts() {
    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    setAccountsLoading(true);
    setError(null);
    try {
      const accountList = await ssoListAccounts(token, region);
      if (!mountedRef.current) return;
      setAccounts(accountList);
      setAccountsLoading(false);

      if (accountList.length === 0) {
        setError("No AWS accounts are assigned to your Identity Center user.");
        return;
      }

      // Auto-select single account
      if (accountList.length === 1) {
        const singleAccount = accountList[0]!;
        setAccountId(singleAccount.accountId);
        await loadRolesForAccount(singleAccount.accountId);
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setAccountsLoading(false);
      const message = err instanceof Error ? err.message : "Failed to list accounts";
      setError(message);
    }
  }

  async function loadRolesForAccount(selectedAccountId: string) {
    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    setRolesLoading(true);
    setRoles([]);
    setRoleName(null);
    setError(null);
    try {
      const roleList = await ssoListAccountRoles(token, selectedAccountId, region);
      if (!mountedRef.current) return;
      setRoles(roleList);
      setRolesLoading(false);

      if (roleList.length === 0) {
        setError("No roles are available for the selected account.");
        return;
      }

      // Auto-select single role
      if (roleList.length === 1) {
        const singleRole = roleList[0]!;
        setRoleName(singleRole.roleName);
        // If both auto-selected, skip setup page entirely
        await resolveCredentials(selectedAccountId, singleRole.roleName);
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setRolesLoading(false);
      const message = err instanceof Error ? err.message : "Failed to list roles";
      setError(message);
    }
  }

  async function resolveCredentials(
    selectedAccountId: string,
    selectedRoleName: string
  ) {
    const token = getToken();
    if (!token) {
      logout();
      return;
    }

    setState("loading");
    setCredentialLoading(true);
    setError(null);
    try {
      const creds = await ssoGetRoleCredentials(
        token,
        selectedAccountId,
        selectedRoleName,
        region
      );
      if (!mountedRef.current) return;
      setCredentialLoading(false);
      transitionToReady(creds, selectedAccountId, selectedRoleName);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setCredentialLoading(false);
      const message = err instanceof Error ? err.message : "Failed to obtain credentials";
      setError(message);
      setState("error");
    }
  }

  // --- Setup page event handlers ---

  function handleSelectAccount(selectedAccountId: string) {
    setAccountId(selectedAccountId);
    setRoleName(null);
    setRoles([]);
    void loadRolesForAccount(selectedAccountId);
  }

  function handleSelectRole(selectedRoleName: string) {
    setRoleName(selectedRoleName);
  }

  function handleContinue() {
    if (accountId && roleName) {
      void resolveCredentials(accountId, roleName);
    }
  }

  function handleRetry() {
    setError(null);
    if (accountId && roleName) {
      void resolveCredentials(accountId, roleName);
    } else if (!accountId) {
      void loadAccounts();
    } else if (roles.length === 0) {
      void loadRolesForAccount(accountId);
    }
  }

  // --- Mount logic ---

  useEffect(() => {
    mountedRef.current = true;

    const storedSelection = getStoredSelection();

    if (storedSelection) {
      // Stored selection found — attempt to resolve credentials directly
      const token = getToken();
      if (!token) {
        clearStoredSelection();
        transitionToPending();
        void loadAccounts();
        return;
      }

      setState("restoring");
      setAccountId(storedSelection.accountId);
      setRoleName(storedSelection.roleName);

      ssoGetRoleCredentials(
        token,
        storedSelection.accountId,
        storedSelection.roleName,
        region
      )
        .then((creds) => {
          if (!mountedRef.current) return;
          transitionToReady(
            creds,
            storedSelection.accountId,
            storedSelection.roleName
          );
        })
        .catch((err: unknown) => {
          if (!mountedRef.current) return;
          // Keep the stored selection — don't dump the user back to the picker.
          // Show an error state so they can retry or explicitly reset.
          const message =
            err instanceof Error ? err.message : "Failed to restore credentials";
          setError(message);
          setState("error");
        });
    } else {
      // No stored selection — start fresh
      transitionToPending();
      void loadAccounts();
    }

    return () => {
      mountedRef.current = false;
      clearRefreshTimer();
    };
  }, []);

  // --- Context value ---

  const contextValue: CredentialsContextValue = {
    state,
    credentials,
    accountId,
    roleName,
    error,
    refresh,
    reset,
  };

  return (
    <CredentialsContext.Provider value={contextValue}>
      {state === "ready" ? (
        children
      ) : state === "restoring" ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
          }}
        >
          <Spinner size="large" />
        </div>
      ) : (
        <CredentialSetupPage
          accounts={accounts}
          roles={roles}
          selectedAccountId={accountId}
          selectedRoleName={roleName}
          accountsLoading={accountsLoading}
          rolesLoading={rolesLoading}
          credentialLoading={credentialLoading}
          error={error}
          onSelectAccount={handleSelectAccount}
          onSelectRole={handleSelectRole}
          onContinue={handleContinue}
          onRetry={handleRetry}
          onReset={reset}
        />
      )}
    </CredentialsContext.Provider>
  );
}

/**
 * Custom hook to access the credentials context.
 * Throws if called outside of a CredentialsProvider.
 */
export function useCredentials(): CredentialsContextValue {
  const context = useContext(CredentialsContext);
  if (context === null) {
    throw new Error(
      "useCredentials must be used within a CredentialsProvider"
    );
  }
  return context;
}
