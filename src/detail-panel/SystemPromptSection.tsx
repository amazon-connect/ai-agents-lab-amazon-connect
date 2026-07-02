// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import ExpandableSection from "@cloudscape-design/components/expandable-section";
import { HelpIcon } from "../contextual-help";
import { CodeDisplay } from "./CodeDisplay";

export interface SystemPromptSectionProps {
  /** System instruction entries from the span's systemInstructions attribute */
  instructions: Array<{ text: { value: string } }>;
}

/**
 * Concatenates all instruction text values with a newline separator.
 * Exported for testability (Property 2).
 */
export function concatenateInstructions(
  instructions: Array<{ text: { value: string } }>
): string {
  return instructions.map((entry) => entry.text.value).join("\n");
}

/**
 * Renders system instructions in a collapsible ExpandableSection (collapsed by default).
 * Concatenates all instruction text values with newline separators and displays
 * the result in a CodeDisplay block.
 *
 * Note: ExpandableSection.headerText does not accept JSX, so the HelpIcon is
 * placed outside the section header using a flex wrapper.
 */
export function SystemPromptSection({ instructions }: SystemPromptSectionProps) {
  const content = concatenateInstructions(instructions);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <ExpandableSection headerText="System prompt" defaultExpanded={false}>
        <CodeDisplay content={content} language="text" />
      </ExpandableSection>
      <HelpIcon
        anchorId="system-prompt"
        pageId="span-detail"
        fieldName="System prompt"
      />
    </div>
  );
}
