// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredWorkspace,
  setStoredWorkspace,
  clearStoredWorkspace,
} from "../workspace-store";

describe("workspace-store", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe("setStoredWorkspace", () => {
    it("persists all fields to sessionStorage", () => {
      setStoredWorkspace({
        instanceId: "i-abc123",
        instanceAlias: "My Instance",
        assistantId: "a-def456",
        assistantName: "My Assistant",
        region: "us-east-1",
      });

      expect(sessionStorage.getItem("ws_instance_id")).toBe("i-abc123");
      expect(sessionStorage.getItem("ws_instance_alias")).toBe("My Instance");
      expect(sessionStorage.getItem("ws_assistant_id")).toBe("a-def456");
      expect(sessionStorage.getItem("ws_assistant_name")).toBe("My Assistant");
      expect(sessionStorage.getItem("ws_region")).toBe("us-east-1");
    });
  });

  describe("getStoredWorkspace", () => {
    it("returns the stored workspace when all required keys are present", () => {
      setStoredWorkspace({
        instanceId: "i-abc123",
        instanceAlias: "My Instance",
        assistantId: "a-def456",
        assistantName: "My Assistant",
        region: "eu-west-2",
      });

      const result = getStoredWorkspace();

      expect(result).toEqual({
        instanceId: "i-abc123",
        instanceAlias: "My Instance",
        assistantId: "a-def456",
        assistantName: "My Assistant",
        region: "eu-west-2",
      });
    });

    it("returns null and clears keys when instance ID is missing", () => {
      sessionStorage.setItem("ws_assistant_id", "a-def456");
      sessionStorage.setItem("ws_region", "us-east-1");

      const result = getStoredWorkspace();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("ws_instance_id")).toBeNull();
      expect(sessionStorage.getItem("ws_assistant_id")).toBeNull();
      expect(sessionStorage.getItem("ws_region")).toBeNull();
    });

    it("returns null and clears keys when assistant ID is missing", () => {
      sessionStorage.setItem("ws_instance_id", "i-abc123");
      sessionStorage.setItem("ws_region", "us-east-1");

      const result = getStoredWorkspace();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("ws_instance_id")).toBeNull();
      expect(sessionStorage.getItem("ws_assistant_id")).toBeNull();
      expect(sessionStorage.getItem("ws_region")).toBeNull();
    });

    it("returns null and clears keys when region is missing", () => {
      sessionStorage.setItem("ws_instance_id", "i-abc123");
      sessionStorage.setItem("ws_assistant_id", "a-def456");

      const result = getStoredWorkspace();

      expect(result).toBeNull();
      expect(sessionStorage.getItem("ws_instance_id")).toBeNull();
      expect(sessionStorage.getItem("ws_assistant_id")).toBeNull();
      expect(sessionStorage.getItem("ws_region")).toBeNull();
    });

    it("returns null and clears keys when instance ID is empty string", () => {
      sessionStorage.setItem("ws_instance_id", "");
      sessionStorage.setItem("ws_assistant_id", "a-def456");
      sessionStorage.setItem("ws_region", "us-east-1");

      const result = getStoredWorkspace();

      expect(result).toBeNull();
    });

    it("returns null and clears keys when assistant ID is empty string", () => {
      sessionStorage.setItem("ws_instance_id", "i-abc123");
      sessionStorage.setItem("ws_assistant_id", "");
      sessionStorage.setItem("ws_region", "us-east-1");

      const result = getStoredWorkspace();

      expect(result).toBeNull();
    });

    it("returns null and clears keys when region is empty string", () => {
      sessionStorage.setItem("ws_instance_id", "i-abc123");
      sessionStorage.setItem("ws_assistant_id", "a-def456");
      sessionStorage.setItem("ws_region", "");

      const result = getStoredWorkspace();

      expect(result).toBeNull();
    });

    it("returns null when no keys are present", () => {
      const result = getStoredWorkspace();

      expect(result).toBeNull();
    });

    it("returns empty string for alias/name when those keys are not set", () => {
      sessionStorage.setItem("ws_instance_id", "i-abc123");
      sessionStorage.setItem("ws_assistant_id", "a-def456");
      sessionStorage.setItem("ws_region", "us-east-1");

      const result = getStoredWorkspace();

      expect(result).toEqual({
        instanceId: "i-abc123",
        instanceAlias: "",
        assistantId: "a-def456",
        assistantName: "",
        region: "us-east-1",
      });
    });
  });

  describe("clearStoredWorkspace", () => {
    it("removes all workspace keys from sessionStorage", () => {
      setStoredWorkspace({
        instanceId: "i-abc123",
        instanceAlias: "My Instance",
        assistantId: "a-def456",
        assistantName: "My Assistant",
        region: "us-east-1",
      });

      clearStoredWorkspace();

      expect(sessionStorage.getItem("ws_instance_id")).toBeNull();
      expect(sessionStorage.getItem("ws_instance_alias")).toBeNull();
      expect(sessionStorage.getItem("ws_assistant_id")).toBeNull();
      expect(sessionStorage.getItem("ws_assistant_name")).toBeNull();
      expect(sessionStorage.getItem("ws_region")).toBeNull();
    });
  });

  describe("localStorage exclusion", () => {
    it("does not write to localStorage", () => {
      setStoredWorkspace({
        instanceId: "i-abc123",
        instanceAlias: "My Instance",
        assistantId: "a-def456",
        assistantName: "My Assistant",
        region: "us-east-1",
      });

      expect(localStorage.getItem("ws_instance_id")).toBeNull();
      expect(localStorage.getItem("ws_instance_alias")).toBeNull();
      expect(localStorage.getItem("ws_assistant_id")).toBeNull();
      expect(localStorage.getItem("ws_assistant_name")).toBeNull();
      expect(localStorage.getItem("ws_region")).toBeNull();
    });
  });
});
