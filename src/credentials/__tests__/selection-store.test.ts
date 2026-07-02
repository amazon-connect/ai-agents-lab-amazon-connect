// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredSelection,
  setStoredSelection,
  clearStoredSelection,
} from "../selection-store";

describe("selection-store", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe("setStoredSelection", () => {
    it("persists account ID and role name to sessionStorage", () => {
      setStoredSelection("123456789012", "AdminAccess");

      expect(sessionStorage.getItem("cred_selected_account")).toBe("123456789012");
      expect(sessionStorage.getItem("cred_selected_role")).toBe("AdminAccess");
    });
  });

  describe("getStoredSelection", () => {
    it("returns the stored selection when both keys are present", () => {
      setStoredSelection("123456789012", "ReadOnly");

      const result = getStoredSelection();

      expect(result).toEqual({ accountId: "123456789012", roleName: "ReadOnly" });
    });

    it("returns null and clears keys when account is missing", () => {
      sessionStorage.setItem("cred_selected_role", "SomeRole");

      const result = getStoredSelection();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("cred_selected_account")).toBeNull();
      expect(sessionStorage.getItem("cred_selected_role")).toBeNull();
    });

    it("returns null and clears keys when role is missing", () => {
      sessionStorage.setItem("cred_selected_account", "123456789012");

      const result = getStoredSelection();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("cred_selected_account")).toBeNull();
      expect(sessionStorage.getItem("cred_selected_role")).toBeNull();
    });

    it("returns null and clears keys when account is empty string", () => {
      sessionStorage.setItem("cred_selected_account", "");
      sessionStorage.setItem("cred_selected_role", "SomeRole");

      const result = getStoredSelection();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("cred_selected_account")).toBeNull();
      expect(sessionStorage.getItem("cred_selected_role")).toBeNull();
    });

    it("returns null and clears keys when role is empty string", () => {
      sessionStorage.setItem("cred_selected_account", "123456789012");
      sessionStorage.setItem("cred_selected_role", "");

      const result = getStoredSelection();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("cred_selected_account")).toBeNull();
      expect(sessionStorage.getItem("cred_selected_role")).toBeNull();
    });

    it("returns null when neither key is present", () => {
      const result = getStoredSelection();

      expect(result).toBeNull();
    });
  });

  describe("clearStoredSelection", () => {
    it("removes both keys from sessionStorage", () => {
      setStoredSelection("123456789012", "AdminAccess");

      clearStoredSelection();

      expect(sessionStorage.getItem("cred_selected_account")).toBeNull();
      expect(sessionStorage.getItem("cred_selected_role")).toBeNull();
    });
  });

  describe("localStorage exclusion", () => {
    it("does not write to localStorage", () => {
      setStoredSelection("123456789012", "AdminAccess");

      expect(localStorage.getItem("cred_selected_account")).toBeNull();
      expect(localStorage.getItem("cred_selected_role")).toBeNull();
    });
  });
});
