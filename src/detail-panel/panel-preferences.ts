// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback } from "react";

/** Panel position preference: horizontal split below or vertical split to the right */
export type PanelPosition = "bottom" | "side";

/** sessionStorage key for persisting panel position */
const PANEL_POSITION_KEY = "span-detail-panel-position";

/**
 * Reads the panel position preference from sessionStorage.
 * Returns "bottom" when no stored preference exists or sessionStorage is unavailable.
 */
export function readPanelPosition(): PanelPosition {
  try {
    const stored = sessionStorage.getItem(PANEL_POSITION_KEY);
    if (stored === "bottom" || stored === "side") {
      return stored;
    }
    return "bottom";
  } catch {
    // sessionStorage unavailable (private browsing, SecurityError, etc.)
    return "bottom";
  }
}

/**
 * Writes the panel position preference to sessionStorage.
 * Silently no-ops when sessionStorage is unavailable.
 */
export function writePanelPosition(position: PanelPosition): void {
  try {
    sessionStorage.setItem(PANEL_POSITION_KEY, position);
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

interface UsePanelPreferencesReturn {
  position: PanelPosition;
  setPosition: (position: PanelPosition) => void;
}

/**
 * Hook that manages panel position preference with sessionStorage persistence.
 * Reads from sessionStorage on mount, defaults to "bottom" when no value exists.
 * Writes to sessionStorage when setPosition is called.
 */
export function usePanelPreferences(): UsePanelPreferencesReturn {
  const [position, setPositionState] = useState<PanelPosition>(readPanelPosition);

  const setPosition = useCallback((newPosition: PanelPosition): void => {
    setPositionState(newPosition);
    writePanelPosition(newPosition);
  }, []);

  return { position, setPosition };
}
