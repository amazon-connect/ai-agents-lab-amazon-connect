// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsPage from "../SettingsPage";

/**
 * Unit tests for SettingsPage — Contact Lens language setting
 * Validates: Requirements 4.1–4.4
 */

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a "Contact Lens language" form field', () => {
    render(<SettingsPage />);
    expect(screen.getByText("Contact Lens language")).toBeInTheDocument();
  });

  it("displays BCP-47 description text", () => {
    render(<SettingsPage />);
    expect(
      screen.getByText(/BCP-47 language code/i)
    ).toBeInTheDocument();
  });

  it('defaults to "en-US" when localStorage has no value', () => {
    render(<SettingsPage />);
    const input = screen.getByDisplayValue("en-US");
    expect(input).toBeInTheDocument();
  });

  it("reads existing value from localStorage on mount", () => {
    localStorage.setItem("analytics-language", "fr-FR");
    render(<SettingsPage />);
    const input = screen.getByDisplayValue("fr-FR");
    expect(input).toBeInTheDocument();
  });

  it("persists value to localStorage on change (before blur)", () => {
    render(<SettingsPage />);
    const input = screen.getByDisplayValue("en-US");
    fireEvent.change(input, { target: { value: "en-AU" } });
    expect(localStorage.getItem("analytics-language")).toBe("en-AU");
  });

  it("updates the displayed value when the user types", () => {
    render(<SettingsPage />);
    const input = screen.getByDisplayValue("en-US");
    fireEvent.change(input, { target: { value: "de-DE" } });
    expect(screen.getByDisplayValue("de-DE")).toBeInTheDocument();
  });
});
