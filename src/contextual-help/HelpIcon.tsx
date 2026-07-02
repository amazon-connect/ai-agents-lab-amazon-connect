// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Icon from "@cloudscape-design/components/icon";
import type { KeyboardEvent } from "react";
import { useContextualHelp } from "../layouts/SplitPanelContext";

export interface HelpIconProps {
  /** Registry key for the field this icon documents */
  anchorId: string;
  /** Page scope for the help overlay */
  pageId: string;
  /** Human-readable field name used in aria-label: "Help for {fieldName}" */
  fieldName: string;
}

/**
 * Inline info icon that opens the contextual help overlay when clicked or
 * activated via keyboard. Renders a Cloudscape status-info icon wrapped in a
 * focusable button element.
 */
export function HelpIcon({ anchorId, pageId, fieldName }: HelpIconProps) {
  const { openHelp } = useContextualHelp();

  function handleClick() {
    openHelp(anchorId, pageId);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openHelp(anchorId, pageId);
    }
  }

  return (
    <button
      type="button"
      aria-label={`Help for ${fieldName}`}
      title="Learn more"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "none",
        border: "none",
        padding: "0 4px",
        cursor: "pointer",
        verticalAlign: "middle",
      }}
    >
      <Icon name="status-info" variant="link" />
    </button>
  );
}
