// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// ─── PTT Controller ──────────────────────────────────────────────────────────
//
// Push-to-Talk controller that manages keyboard (spacebar) and pointer
// (mousedown/mouseup, touchstart/touchend) events for mute/unmute control.
// Auto-deactivates on visibility change (document hidden) or window blur.

export interface PTTControllerOptions {
  /** Called when PTT is activated (unmute) */
  onActivate: () => void;
  /** Called when PTT is deactivated (mute) */
  onDeactivate: () => void;
  /** Optional: the PTT button element for mouse/touch events */
  pttButtonElement?: HTMLElement | null;
}

// ─── Text-Editable Element Detection ─────────────────────────────────────────

/** Input types that accept text entry and should block spacebar PTT. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "password",
  "email",
  "number",
]);

/**
 * Determine whether a keyboard event target is a text-editable element
 * (input[type=text/search/url/tel/password/email/number], textarea,
 * contenteditable) where spacebar should be ignored for PTT purposes.
 */
export function isTextEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  // Check for textarea
  if (target.tagName === "TEXTAREA") {
    return true;
  }

  // Check for input with text-editable type
  if (target.tagName === "INPUT") {
    const inputType = (target as HTMLInputElement).type.toLowerCase();
    return TEXT_INPUT_TYPES.has(inputType);
  }

  // Check for contenteditable
  const contentEditable = target.getAttribute("contenteditable");
  if (
    target.isContentEditable ||
    contentEditable === "true" ||
    contentEditable === ""
  ) {
    return true;
  }

  // Also check the contentEditable property directly (for programmatic setting)
  if ((target as HTMLElement).contentEditable === "true") {
    return true;
  }

  return false;
}

// ─── PTT Controller ──────────────────────────────────────────────────────────

/**
 * Create a PTT controller that manages keyboard (spacebar) and
 * pointer (mousedown/mouseup, touchstart/touchend) events.
 * Returns a cleanup function to remove all event listeners.
 */
export function createPTTController(options: PTTControllerOptions): () => void {
  const { onActivate, onDeactivate, pttButtonElement } = options;

  let isActive = false;

  function activate(): void {
    if (!isActive) {
      isActive = true;
      onActivate();
    }
  }

  function deactivate(): void {
    if (isActive) {
      isActive = false;
      onDeactivate();
    }
  }

  // ─── Keyboard Events (spacebar) ─────────────────────────────────────────

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.code !== "Space" && event.key !== " ") return;
    if (event.repeat) return;
    if (isTextEditableElement(event.target)) return;

    event.preventDefault();
    activate();
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.code !== "Space" && event.key !== " ") return;
    if (isTextEditableElement(event.target)) return;

    event.preventDefault();
    deactivate();
  }

  // ─── Mouse Events (PTT button) ─────────────────────────────────────────

  function handleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    activate();
  }

  function handleMouseUp(): void {
    deactivate();
  }

  // ─── Touch Events (PTT button) ─────────────────────────────────────────

  function handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    activate();
  }

  function handleTouchEnd(): void {
    deactivate();
  }

  // ─── Visibility / Focus Events ─────────────────────────────────────────

  function handleVisibilityChange(): void {
    if (document.hidden) {
      deactivate();
    }
  }

  function handleWindowBlur(): void {
    deactivate();
  }

  // ─── Register Event Listeners ──────────────────────────────────────────

  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleWindowBlur);

  if (pttButtonElement) {
    pttButtonElement.addEventListener("mousedown", handleMouseDown);
    pttButtonElement.addEventListener("mouseup", handleMouseUp);
    pttButtonElement.addEventListener("mouseleave", handleMouseUp);
    pttButtonElement.addEventListener("touchstart", handleTouchStart);
    pttButtonElement.addEventListener("touchend", handleTouchEnd);
    pttButtonElement.addEventListener("touchcancel", handleTouchEnd);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  return function cleanup(): void {
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keyup", handleKeyUp);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleWindowBlur);

    if (pttButtonElement) {
      pttButtonElement.removeEventListener("mousedown", handleMouseDown);
      pttButtonElement.removeEventListener("mouseup", handleMouseUp);
      pttButtonElement.removeEventListener("mouseleave", handleMouseUp);
      pttButtonElement.removeEventListener("touchstart", handleTouchStart);
      pttButtonElement.removeEventListener("touchend", handleTouchEnd);
      pttButtonElement.removeEventListener("touchcancel", handleTouchEnd);
    }

    // Ensure we deactivate on cleanup
    deactivate();
  };
}
