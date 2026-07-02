// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import SplitPanel from "@cloudscape-design/components/split-panel";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import { HELP_REGISTRY } from "./help-registry";
import type { HelpEntry } from "./types";

// Inject the highlight keyframe animation once into the document head.
if (typeof document !== "undefined") {
  const styleId = "help-panel-highlight-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes help-panel-highlight-pulse {
        0%   { background-color: rgba(0, 115, 187, 0.1); }
        100% { background-color: transparent; }
      }
      .help-entry-anchored {
        border-left: 3px solid #0073bb;
        margin-left: -11px;
        padding-left: 8px;
        border-radius: 2px;
        animation: help-panel-highlight-pulse 0.6s ease-out forwards;
      }
    `;
    document.head.appendChild(style);
  }
}

export interface HelpOverlayProps {
  /** Registry key for the field to anchor at the top */
  anchorId: string;
  /** Page scope — used to look up entries in HELP_REGISTRY */
  pageId: string;
}

/**
 * Renders a Cloudscape SplitPanel with help entries.
 * The entry matching `anchorId` is shown first with a highlight animation;
 * all other entries follow in registry order.
 */
export function HelpOverlay({ anchorId, pageId }: HelpOverlayProps) {
  const pageEntries = HELP_REGISTRY[pageId] ?? [];
  const anchoredEntry = pageEntries.find((e) => e.id === anchorId) ?? null;
  const remainingEntries = pageEntries.filter((e) => e.id !== anchorId);

  return (
    <SplitPanel
      header="Help"
      closeBehavior="hide"
      i18nStrings={{
        preferencesTitle: "Split panel preferences",
        preferencesPositionLabel: "Position",
        preferencesPositionDescription:
          "Choose where the panel appears relative to the content.",
        preferencesPositionSide: "Side",
        preferencesPositionBottom: "Bottom",
        preferencesConfirm: "Confirm",
        preferencesCancel: "Cancel",
        closeButtonAriaLabel: "Close panel",
        openButtonAriaLabel: "Open panel",
        resizeHandleAriaLabel: "Resize panel",
      }}
    >
      <div style={{ paddingBottom: "24px" }}>
        <SpaceBetween size="l">
          {anchoredEntry && (
            <div key={`${anchorId}-${Date.now()}`} className="help-entry-anchored">
              <HelpEntrySection entry={anchoredEntry} />
            </div>
          )}
          {remainingEntries.map((entry) => (
            <HelpEntrySection key={entry.id} entry={entry} />
          ))}
        </SpaceBetween>
      </div>
    </SplitPanel>
  );
}

/**
 * Renders a single HelpEntry as a titled section with body paragraphs
 * and optional external links.
 */
function HelpEntrySection({ entry }: { entry: HelpEntry }) {
  return (
    <SpaceBetween size="s">
      <Box variant="h3">{entry.title}</Box>
      {entry.body.map((paragraph, i) => (
        <Box key={i} variant="p">
          {paragraph}
        </Box>
      ))}
      {entry.links && entry.links.length > 0 && (
        <ul>
          {entry.links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} external>
                {link.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SpaceBetween>
  );
}
