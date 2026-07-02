// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Session-scoped persistence for the user's account/role selection.
 *
 * Values are stored in sessionStorage so they survive page refreshes
 * within the same tab but are cleared when the tab is closed.
 * No writes to localStorage — closing the tab clears everything.
 */

const STORAGE_KEY_ACCOUNT = "cred_selected_account";
const STORAGE_KEY_ROLE = "cred_selected_role";

export interface StoredSelection {
  accountId: string;
  roleName: string;
}

/** Returns the stored selection, or null if incomplete or missing. */
export function getStoredSelection(): StoredSelection | null {
  const accountId = sessionStorage.getItem(STORAGE_KEY_ACCOUNT);
  const roleName = sessionStorage.getItem(STORAGE_KEY_ROLE);

  if (!accountId || !roleName) {
    clearStoredSelection();
    return null;
  }

  return { accountId, roleName };
}

/** Persists the account ID and role name to sessionStorage. */
export function setStoredSelection(accountId: string, roleName: string): void {
  sessionStorage.setItem(STORAGE_KEY_ACCOUNT, accountId);
  sessionStorage.setItem(STORAGE_KEY_ROLE, roleName);
}

/** Clears all stored selection values from sessionStorage. */
export function clearStoredSelection(): void {
  sessionStorage.removeItem(STORAGE_KEY_ACCOUNT);
  sessionStorage.removeItem(STORAGE_KEY_ROLE);
}
