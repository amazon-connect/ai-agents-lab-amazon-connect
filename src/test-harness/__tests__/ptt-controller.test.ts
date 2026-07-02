// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { isTextEditableElement, createPTTController } from "../ptt-controller";

describe("ptt-controller", () => {
  describe("isTextEditableElement", () => {
    it("returns true for input[type=text]", () => {
      const input = document.createElement("input");
      input.type = "text";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for input[type=search]", () => {
      const input = document.createElement("input");
      input.type = "search";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for input[type=url]", () => {
      const input = document.createElement("input");
      input.type = "url";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for input[type=tel]", () => {
      const input = document.createElement("input");
      input.type = "tel";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for input[type=password]", () => {
      const input = document.createElement("input");
      input.type = "password";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for input[type=email]", () => {
      const input = document.createElement("input");
      input.type = "email";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for input[type=number]", () => {
      const input = document.createElement("input");
      input.type = "number";
      expect(isTextEditableElement(input)).toBe(true);
    });

    it("returns true for textarea", () => {
      const textarea = document.createElement("textarea");
      expect(isTextEditableElement(textarea)).toBe(true);
    });

    it("returns true for contenteditable element", () => {
      const div = document.createElement("div");
      div.contentEditable = "true";
      expect(isTextEditableElement(div)).toBe(true);
    });

    it("returns false for input[type=button]", () => {
      const input = document.createElement("input");
      input.type = "button";
      expect(isTextEditableElement(input)).toBe(false);
    });

    it("returns false for input[type=checkbox]", () => {
      const input = document.createElement("input");
      input.type = "checkbox";
      expect(isTextEditableElement(input)).toBe(false);
    });

    it("returns false for input[type=radio]", () => {
      const input = document.createElement("input");
      input.type = "radio";
      expect(isTextEditableElement(input)).toBe(false);
    });

    it("returns false for a regular div", () => {
      const div = document.createElement("div");
      expect(isTextEditableElement(div)).toBe(false);
    });

    it("returns false for a button element", () => {
      const button = document.createElement("button");
      expect(isTextEditableElement(button)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isTextEditableElement(null)).toBe(false);
    });
  });

  describe("createPTTController", () => {
    let onActivate: Mock<() => void>;
    let onDeactivate: Mock<() => void>;
    let cleanup: () => void;

    beforeEach(() => {
      onActivate = vi.fn();
      onDeactivate = vi.fn();
    });

    afterEach(() => {
      if (cleanup) cleanup();
    });

    it("activates on spacebar keydown", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );

      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onDeactivate).not.toHaveBeenCalled();
    });

    it("deactivates on spacebar keyup", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );
      document.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true })
      );

      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onDeactivate).toHaveBeenCalledTimes(1);
    });

    it("ignores repeated keydown events", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", repeat: true, bubbles: true })
      );

      expect(onActivate).not.toHaveBeenCalled();
    });

    it("does not double-activate on multiple keydowns without keyup", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );
      // Simulate a second keydown (non-repeat, e.g. from a different source)
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );

      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it("ignores spacebar when target is a text input", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);

      const event = new KeyboardEvent("keydown", {
        code: "Space",
        key: " ",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input });
      document.dispatchEvent(event);

      expect(onActivate).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("ignores spacebar when target is a textarea", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);

      const event = new KeyboardEvent("keydown", {
        code: "Space",
        key: " ",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: textarea });
      document.dispatchEvent(event);

      expect(onActivate).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it("ignores non-spacebar keys", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true })
      );

      expect(onActivate).not.toHaveBeenCalled();
    });

    it("activates on mousedown on PTT button", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      cleanup = createPTTController({ onActivate, onDeactivate, pttButtonElement: button });

      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      expect(onActivate).toHaveBeenCalledTimes(1);
      document.body.removeChild(button);
    });

    it("deactivates on mouseup on PTT button", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      cleanup = createPTTController({ onActivate, onDeactivate, pttButtonElement: button });

      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      expect(onDeactivate).toHaveBeenCalledTimes(1);
      document.body.removeChild(button);
    });

    it("deactivates on mouseleave from PTT button", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      cleanup = createPTTController({ onActivate, onDeactivate, pttButtonElement: button });

      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

      expect(onDeactivate).toHaveBeenCalledTimes(1);
      document.body.removeChild(button);
    });

    it("activates on touchstart on PTT button", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      cleanup = createPTTController({ onActivate, onDeactivate, pttButtonElement: button });

      button.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));

      expect(onActivate).toHaveBeenCalledTimes(1);
      document.body.removeChild(button);
    });

    it("deactivates on touchend on PTT button", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      cleanup = createPTTController({ onActivate, onDeactivate, pttButtonElement: button });

      button.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
      button.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));

      expect(onDeactivate).toHaveBeenCalledTimes(1);
      document.body.removeChild(button);
    });

    it("deactivates on document visibility change to hidden", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      // Activate first
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );
      expect(onActivate).toHaveBeenCalledTimes(1);

      // Simulate visibility change
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(onDeactivate).toHaveBeenCalledTimes(1);

      // Restore
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    });

    it("deactivates on window blur", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      // Activate first
      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );
      expect(onActivate).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new Event("blur"));

      expect(onDeactivate).toHaveBeenCalledTimes(1);
    });

    it("does not call deactivate if not active on visibility change", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });

      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(onDeactivate).not.toHaveBeenCalled();

      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    });

    it("removes all event listeners on cleanup", () => {
      cleanup = createPTTController({ onActivate, onDeactivate });
      cleanup();

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })
      );

      expect(onActivate).not.toHaveBeenCalled();
    });
  });
});
