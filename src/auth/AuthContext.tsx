// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Spinner from "@cloudscape-design/components/spinner";
import type { AuthContextValue, AuthState, AuthUser } from "./types";
import { isDevBypass, getOIDCConfig } from "./config";
import { handleCallback, initiateLogin, resolveDisplayName } from "./oidc-client";
import { clearToken, getToken, setToken } from "./token-store";
import { LoginPage } from "../pages/LoginPage";

const LOADING_TIMEOUT_MS = 10_000;

const defaultContextValue: AuthContextValue = {
  state: "unauthenticated",
  user: null,
  login: () => {},
  logout: () => {},
  error: null,
};

export const AuthContext = createContext<AuthContextValue>(defaultContextValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("unauthenticated");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Dev bypass: immediately authenticate with mock user
    if (isDevBypass()) {
      setToken("dev-bypass-token");
      setUser({ displayName: "Dev User" });
      setState("authenticated");
      return;
    }

    // Check URL for authorization code callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const urlState = params.get("state");

    if (code && urlState) {
      setState("loading");

      const config = getOIDCConfig();
      if (!config) {
        setState("unauthenticated");
        setError("OIDC configuration is not available");
        removeCodeFromUrl();
        return;
      }

      // Set up loading timeout
      const timeoutId = setTimeout(() => {
        setState("unauthenticated");
        setError("Sign-in attempt timed out");
      }, LOADING_TIMEOUT_MS);

      handleCallback(code, urlState, config)
        .then(({ displayName }) => {
          clearTimeout(timeoutId);
          setUser({ displayName });
          setState("authenticated");
        })
        .catch((err: unknown) => {
          clearTimeout(timeoutId);
          const message =
            err instanceof Error ? err.message : "Authentication failed";
          setError(message);
          setState("unauthenticated");
        })
        .finally(() => {
          removeCodeFromUrl();
        });
      return;
    }

    // Restore session from sessionStorage if token is still valid
    const existingToken = getToken();
    if (existingToken) {
      // Token exists and hasn't expired — decode claims for display name
      const claims = decodeTokenClaims(existingToken);
      const displayName = resolveDisplayName(claims);
      setUser({ displayName });
      setState("authenticated");
      return;
    }

    // No code in URL and no stored token — remain unauthenticated
  }, []);

  function login() {
    setError(null);
    const config = getOIDCConfig();
    if (!config) {
      setError("OIDC configuration is not available");
      return;
    }
    initiateLogin(config);
  }

  function logout() {
    clearToken();
    sessionStorage.clear();
    setUser(null);
    setError(null);
    setState("unauthenticated");
  }

  const contextValue: AuthContextValue = {
    state,
    user,
    login,
    logout,
    error,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {state === "authenticated" && children}
      {state === "unauthenticated" && <LoginPage />}
      {state === "loading" && (
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
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/** Removes code and state query parameters from the URL without a page reload. */
function removeCodeFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

/** Decodes the payload of a JWT without verifying the signature. */
function decodeTokenClaims(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const payload = parts[1]!;
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}
