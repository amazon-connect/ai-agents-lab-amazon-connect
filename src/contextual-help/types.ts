// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * A single documented field or section in the contextual help system.
 * The `id` matches the `anchorId` passed to `openHelp`.
 */
export interface HelpEntry {
  /** Unique identifier within a page's registry — matches the anchorId passed to openHelp */
  id: string;
  /** Heading displayed in the HelpPanel section */
  title: string;
  /** One or more body paragraphs */
  body: string[];
  /** Optional external links rendered in the section footer */
  links?: Array<{ text: string; href: string }>;
}

/**
 * A per-page map from pageId strings to arrays of HelpEntry objects.
 * Each entry in the array must have a unique `id` within its page.
 *
 * Using an interface (not Record<string, ...>) so that known keys are
 * non-optional and TypeScript doesn't widen access to `HelpEntry[] | undefined`.
 */
export interface HelpRegistry {
  [pageId: string]: HelpEntry[] | undefined;
  testing: HelpEntry[];
  "credential-setup": HelpEntry[];
  "span-detail": HelpEntry[];
  settings: HelpEntry[];
  evaluations: HelpEntry[];
}
