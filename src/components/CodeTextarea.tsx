// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatusBarState =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export interface CodeTextareaProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  status?: StatusBarState;
  /** Whether to intercept Tab key and insert spaces instead of moving focus */
  tabIndent?: boolean;
}

// ─── Colours — aligned with Cloudscape light theme ───────────────────────────
// Border / focus values match Cloudscape's own Input/Textarea tokens.

const COLORS = {
  bg: "#ffffff",
  bgDisabled: "#f2f3f3",
  lineNumberBg: "#f8f8f8",
  lineNumberText: "#aab7b8",
  lineNumberActiveBg: "#eef0f0",
  lineNumberActiveText: "#545b64",
  text: "#16191f",
  textDisabled: "#879596",
  border: "#aab7b8",
  borderFocus: "#0972d3",
  caretColor: "#16191f",
  statusBg: "#f8f8f8",
  statusSuccess: "#1d8102",
  statusError: "#d13212",
  statusIdle: "#879596",
  scrollbar: "#d5dbdb",
  scrollbarHover: "#aab7b8",
} as const;

const FONT = "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const FONT_SIZE = "13px";
const LINE_HEIGHT = "20px"; // px value keeps line number sync exact
const LINE_HEIGHT_PX = 20;
const PADDING_TOP = 8;
const PADDING_LEFT = 8;
const PADDING_RIGHT = 8;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CodeTextarea({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  rows = 12,
  placeholder,
  maxLength,
  ariaLabel,
  status = { type: "idle" },
  tabIndent = true,
}: CodeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeLine, setActiveLine] = useState(1);

  // Sync line-number scroll position with textarea scroll
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const ln = lineNumbersRef.current;
    if (ta && ln) {
      ln.scrollTop = ta.scrollTop;
    }
  }, []);

  // Update active line from cursor position
  const updateActiveLine = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const textBefore = ta.value.substring(0, ta.selectionStart);
    const line = textBefore.split("\n").length;
    setActiveLine(line);
  }, []);

  // Ensure scroll stays synced after value changes (e.g. external updates)
  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (maxLength !== undefined && next.length > maxLength) return;
      onChange?.(next);
      updateActiveLine();
    },
    [onChange, maxLength, updateActiveLine]
  );

  const handleScroll = useCallback(() => {
    syncScroll();
  }, [syncScroll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!tabIndent || e.key !== "Tab") return;
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = ta.value.substring(0, start) + "  " + ta.value.substring(end);
      onChange?.(next);
      requestAnimationFrame(() => {
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2;
      });
    },
    [tabIndent, onChange]
  );

  const handleSelect = useCallback(() => {
    updateActiveLine();
  }, [updateActiveLine]);

  const handleClick = useCallback(() => {
    updateActiveLine();
  }, [updateActiveLine]);

  // ─── Line numbers ──────────────────────────────────────────────────────────

  const lineCount = value === "" ? 1 : value.split("\n").length;
  const lineNumberWidth = Math.max(String(lineCount).length, 2) * 9 + 16; // ~9px per digit + padding

  // ─── Status bar ────────────────────────────────────────────────────────────

  const statusColor =
    status.type === "success"
      ? COLORS.statusSuccess
      : status.type === "error"
        ? COLORS.statusError
        : COLORS.statusIdle;

  const statusText =
    status.type === "idle"
      ? `${lineCount} line${lineCount !== 1 ? "s" : ""}`
      : status.message;

  const statusIcon =
    status.type === "success" ? "✓ " : status.type === "error" ? "✗ " : "";

  // ─── Styles ────────────────────────────────────────────────────────────────

  const editorHeight = LINE_HEIGHT_PX * rows + PADDING_TOP * 2;

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    borderRadius: "6px",
    border: `1px solid ${focused && !disabled ? COLORS.borderFocus : COLORS.border}`,
    overflow: "hidden",
    transition: "border-color 0.15s ease",
    boxSizing: "border-box",
  };

  const editorRowStyle: React.CSSProperties = {
    display: "flex",
    height: `${editorHeight}px`,
    overflow: "hidden",
    backgroundColor: disabled ? COLORS.bgDisabled : COLORS.bg,
  };

  const lineNumbersStyle: React.CSSProperties = {
    width: `${lineNumberWidth}px`,
    flexShrink: 0,
    backgroundColor: COLORS.lineNumberBg,
    overflowY: "hidden",
    overflowX: "hidden",
    paddingTop: `${PADDING_TOP}px`,
    paddingBottom: `${PADDING_TOP}px`,
    boxSizing: "border-box",
    borderRight: `1px solid ${COLORS.border}`,
    userSelect: "none",
  };

  const textareaStyle: React.CSSProperties = {
    flex: 1,
    resize: "none",
    border: "none",
    outline: "none",
    backgroundColor: "transparent",
    color: disabled ? COLORS.textDisabled : COLORS.text,
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    padding: `${PADDING_TOP}px ${PADDING_RIGHT}px ${PADDING_TOP}px ${PADDING_LEFT}px`,
    boxSizing: "border-box",
    caretColor: COLORS.caretColor,
    tabSize: 2,
    whiteSpace: "pre",
    overflowWrap: "normal",
    overflowX: "auto",
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: `${COLORS.scrollbar} transparent`,
  };

  const statusBarStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.statusBg,
    borderTop: `1px solid ${COLORS.border}`,
    padding: "3px 10px",
    fontFamily: FONT,
    fontSize: "11px",
    lineHeight: "16px",
    userSelect: "none",
    minHeight: "22px",
  };

  return (
    <div style={containerStyle}>
      <div style={editorRowStyle}>
        {/* Line numbers */}
        <div ref={lineNumbersRef} style={lineNumbersStyle} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => {
            const num = i + 1;
            const isActive = num === activeLine && focused;
            return (
              <div
                key={num}
                style={{
                  height: LINE_HEIGHT,
                  lineHeight: LINE_HEIGHT,
                  paddingRight: "8px",
                  paddingLeft: "6px",
                  textAlign: "right",
                  fontFamily: FONT,
                  fontSize: FONT_SIZE,
                  color: isActive ? COLORS.lineNumberActiveText : COLORS.lineNumberText,
                  backgroundColor: isActive ? COLORS.lineNumberActiveBg : "transparent",
                  transition: "color 0.1s, background-color 0.1s",
                  boxSizing: "border-box",
                }}
              >
                {num}
              </div>
            );
          })}
        </div>

        {/* Editable textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onClick={handleClick}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          style={textareaStyle}
        />
      </div>

      {/* Status bar */}
      <div style={statusBarStyle}>
        <span style={{ color: statusColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {statusIcon}{statusText}
        </span>
        <span style={{ color: COLORS.statusIdle, flexShrink: 0, marginLeft: "12px" }}>
          {maxLength !== undefined
            ? `${value.length} / ${maxLength.toLocaleString()}`
            : `Ln ${activeLine}`}
        </span>
      </div>
    </div>
  );
}
