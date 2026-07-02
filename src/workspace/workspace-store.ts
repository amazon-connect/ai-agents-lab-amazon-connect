// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Session-scoped persistence for the user's workspace selection.
 *
 * Values are stored in sessionStorage so they survive page refreshes
 * within the same tab but are cleared when the tab is closed.
 * No writes to localStorage — closing the tab clears everything.
 */

import type { StoredWorkspace } from "./types";

const STORAGE_KEY_INSTANCE_ID = "ws_instance_id";
const STORAGE_KEY_INSTANCE_ALIAS = "ws_instance_alias";
const STORAGE_KEY_ASSISTANT_ID = "ws_assistant_id";
const STORAGE_KEY_ASSISTANT_NAME = "ws_assistant_name";
const STORAGE_KEY_REGION = "ws_region";

/** Returns the stored workspace, or null if incomplete or missing. */
export function getStoredWorkspace(): StoredWorkspace | null {
  const instanceId = sessionStorage.getItem(STORAGE_KEY_INSTANCE_ID);
  const assistantId = sessionStorage.getItem(STORAGE_KEY_ASSISTANT_ID);
  const region = sessionStorage.getItem(STORAGE_KEY_REGION);

  if (!instanceId || !assistantId || !region) {
    clearStoredWorkspace();
    return null;
  }

  return {
    instanceId,
    instanceAlias: sessionStorage.getItem(STORAGE_KEY_INSTANCE_ALIAS) ?? "",
    assistantId,
    assistantName: sessionStorage.getItem(STORAGE_KEY_ASSISTANT_NAME) ?? "",
    region,
  };
}

/** Persists the workspace selection to sessionStorage. */
export function setStoredWorkspace(workspace: StoredWorkspace): void {
  sessionStorage.setItem(STORAGE_KEY_INSTANCE_ID, workspace.instanceId);
  sessionStorage.setItem(STORAGE_KEY_INSTANCE_ALIAS, workspace.instanceAlias);
  sessionStorage.setItem(STORAGE_KEY_ASSISTANT_ID, workspace.assistantId);
  sessionStorage.setItem(STORAGE_KEY_ASSISTANT_NAME, workspace.assistantName);
  sessionStorage.setItem(STORAGE_KEY_REGION, workspace.region);
}

/** Clears all stored workspace values from sessionStorage. */
export function clearStoredWorkspace(): void {
  sessionStorage.removeItem(STORAGE_KEY_INSTANCE_ID);
  sessionStorage.removeItem(STORAGE_KEY_INSTANCE_ALIAS);
  sessionStorage.removeItem(STORAGE_KEY_ASSISTANT_ID);
  sessionStorage.removeItem(STORAGE_KEY_ASSISTANT_NAME);
  sessionStorage.removeItem(STORAGE_KEY_REGION);
}
