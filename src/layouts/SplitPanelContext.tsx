// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import type { AppLayoutProps } from "@cloudscape-design/components/app-layout";
import { HELP_REGISTRY } from "../contextual-help/help-registry";
import { HelpOverlay } from "../contextual-help/HelpOverlay";

export interface SplitPanelConfig {
  /** The SplitPanel element to render */
  panel: ReactNode;
  /** Whether the panel is open */
  open: boolean;
  /** Position preferences */
  preferences: AppLayoutProps.SplitPanelPreferences;
  /** Called when the user changes position preferences */
  onPreferencesChange: (detail: AppLayoutProps.SplitPanelPreferences) => void;
  /** Called when the panel is toggled (closed via X button) */
  onToggle: (open: boolean) => void;
  /** Optional explicit panel size in pixels */
  size?: number;
  /** Called when the user resizes the panel */
  onResize?: (size: number) => void;
}

interface SplitPanelContextValue {
  config: SplitPanelConfig | null;
  setConfig: (config: SplitPanelConfig | null) => void;
  openHelp: (anchorId: string, pageId: string) => void;
  closeHelp: () => void;
  isHelpOpen: boolean;
}

const SplitPanelContext = createContext<SplitPanelContextValue>({
  config: null,
  setConfig: () => {},
  openHelp: () => {},
  closeHelp: () => {},
  isHelpOpen: false,
});

export function SplitPanelProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SplitPanelConfig | null>(null);
  const [helpState, setHelpState] = useState<{
    anchorId: string;
    pageId: string;
  } | null>(null);

  // Tracks the current size of the help panel so the user can resize it freely
  const [helpSize, setHelpSize] = useState<number | undefined>(undefined);

  // Used to force a close→open cycle when help opens so splitPanelSize is re-read
  const [helpPanelOpen, setHelpPanelOpen] = useState(true);

  useEffect(() => {
    if (helpState !== null) {
      // Briefly close then reopen so Cloudscape picks up the new splitPanelSize
      setHelpPanelOpen(false);
      const id = setTimeout(() => setHelpPanelOpen(true), 0);
      return () => clearTimeout(id);
    }
  }, [helpState?.anchorId, helpState?.pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref to read current config synchronously inside openHelp's functional updater
  const configRef = useRef<SplitPanelConfig | null>(null);
  configRef.current = config;

  // Snapshot of the config that was active before help mode was opened
  const previousConfigRef = useRef<SplitPanelConfig | null>(null);

  const setConfig = useCallback((newConfig: SplitPanelConfig | null) => {
    setConfigState(newConfig);
  }, []);

  const openHelp = useCallback((anchorId: string, pageId: string) => {
    // Warn for unknown pageId (req 9.3)
    if (!HELP_REGISTRY[pageId]) {
      console.warn(
        `[ContextualHelp] Unknown pageId "${pageId}". ` +
          `No registry entries found. Showing anchored entry only if it exists.`
      );
    } else {
      // Warn for unknown anchorId within the page (req 9.4)
      const pageEntries = HELP_REGISTRY[pageId];
      const anchoredEntry = pageEntries.find((e) => e.id === anchorId);
      if (!anchoredEntry) {
        console.warn(
          `[ContextualHelp] Unknown anchorId "${anchorId}" for pageId "${pageId}". ` +
            `Showing all entries without an anchor.`
        );
      }
    }

    setHelpState((prev) => {
      if (prev === null) {
        // First open — snapshot the current config (req 3.3)
        previousConfigRef.current = configRef.current;
        // Reset size so the default kicks in for this session
        setHelpSize(undefined);
      }
      // If already open, just update anchorId — do NOT replace snapshot (req 3.4)
      return { anchorId, pageId };
    });
  }, []);

  const closeHelp = useCallback(() => {
    setHelpState(null);
    // Restore previous config, or null to close the panel (req 3.2, 4.5, 4.6)
    setConfigState(previousConfigRef.current);
    previousConfigRef.current = null;
  }, []);

  // isHelpOpen is true whenever helpState is non-null (req 3.5)
  const isHelpOpen = helpState !== null;

  // Derive effectiveConfig: when help is open, override panel/open/preferences
  // so AppShell renders HelpOverlay without any changes to AppShell.tsx (req 3.1–3.6, 4.5–4.7)
  const effectiveConfig = useMemo<SplitPanelConfig | null>(() => {
    if (helpState === null) return config;

    return {
      panel: (
        <HelpOverlay
          anchorId={helpState.anchorId}
          pageId={helpState.pageId}
        />
      ),
      open: helpPanelOpen,
      preferences: previousConfigRef.current?.preferences ?? { position: "side" },
      size: helpSize ?? ((previousConfigRef.current?.preferences?.position ?? "side") === "bottom" ? 500 : 400),
      onResize: setHelpSize,
      onPreferencesChange: (detail: AppLayoutProps.SplitPanelPreferences) => {
        // Persist preference changes so they survive closeHelp and work even
        // when no previous split panel config existed (e.g., settings pages)
        if (previousConfigRef.current) {
          previousConfigRef.current = {
            ...previousConfigRef.current,
            preferences: detail,
          };
        } else {
          previousConfigRef.current = {
            panel: null,
            open: false,
            preferences: detail,
            onPreferencesChange: () => {},
            onToggle: () => {},
          };
        }
      },
      onToggle: (open: boolean) => {
        if (!open) closeHelp();
      },
    };
  }, [helpState, config, closeHelp, helpSize, helpPanelOpen]);

  return (
    <SplitPanelContext.Provider
      value={{ config: effectiveConfig, setConfig, openHelp, closeHelp, isHelpOpen }}
    >
      {children}
    </SplitPanelContext.Provider>
  );
}

/**
 * Hook for child pages to register split panel configuration with the AppShell.
 * Returns setConfig to register/unregister the split panel.
 */
export function useSplitPanelControl() {
  const { setConfig } = useContext(SplitPanelContext);
  return { setConfig };
}

/**
 * Hook for AppShell to read the current split panel configuration.
 * After task 6.1, this will return effectiveConfig (which may be the HelpOverlay).
 */
export function useSplitPanelConfig() {
  const { config } = useContext(SplitPanelContext);
  return config;
}

/**
 * Hook for components to access contextual help actions.
 * Returns { openHelp, closeHelp, isHelpOpen } (req 3.6).
 */
export function useContextualHelp() {
  const { openHelp, closeHelp, isHelpOpen } = useContext(SplitPanelContext);
  return { openHelp, closeHelp, isHelpOpen };
}
