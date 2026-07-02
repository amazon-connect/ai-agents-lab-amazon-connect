// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export interface TranscriptSegment {
  participantRole: "AGENT" | "CUSTOMER" | "SYSTEM";
  displayText: string;
  timestamp: number; // epoch ms
}

export type HydrationStatus = "pending" | "loading" | "awaiting_analysis" | "ready" | "failed";

export interface HydrationEntry {
  contactId: string;
  iterationNumber: number;
  status: HydrationStatus;
  segments: TranscriptSegment[] | null;
  error: string | null;
}

export interface HydrationCallbacks {
  onStatusChange: (
    contactId: string,
    status: HydrationStatus,
    segments?: TranscriptSegment[],
    error?: string
  ) => void;
}

export type ImportResult =
  | {
      success: true;
      scriptName: string;
      totalIterations: number;
      completedWithContactId: { contactId: string; iterationNumber: number }[];
    }
  | { success: false; error: string };

export interface EvaluationsState {
  phase: "import" | "hydrating" | "selecting_forms" | "evaluating" | "complete";
  importMeta: {
    scriptName: string;
    totalIterations: number;
    completedCount: number;
  } | null;
  entries: Map<string, HydrationEntry>; // keyed by contactId
}

// --- Verdict ---

export type Verdict = "pass" | "fail" | "partial";

// --- Score Distribution ---

export interface ScoreDistribution {
  bucket0to25: number;
  bucket26to50: number;
  bucket51to75: number;
  bucket76to100: number;
}

// --- Connect Evaluations Types ---

/** Summary of an evaluation form returned by SearchEvaluationForms */
export interface EvaluationFormSummary {
  evaluationFormId: string;
  title: string;
  lastActivatedTime: number;
  autoEvaluationEnabled: boolean;
}

/** Result of a single contact evaluation (one contact × one form) */
export interface ContactEvaluation {
  evaluationId: string;
  contactId: string;
  evaluationFormId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  score?: number;           // 0–100
  answers?: EvaluationAnswer[];
  sectionScores?: SectionScore[];
  error?: string;
}

/** A single answer within a completed evaluation */
export interface EvaluationAnswer {
  questionRefId: string;
  questionTitle: string;
  sectionTitle: string;
  value: string;            // "Yes", "No", "N/A", etc.
  score: number;            // 0–100 percentage
  justification?: string;   // GenAI rationale
}

/** Per-section score within an evaluation */
export interface SectionScore {
  sectionRefId: string;
  sectionTitle: string;
  percentage: number;       // 0–100 (weighted contribution to overall score)
  earnedPoints: number;     // points scored in this section
  maxBasePoint: number;     // maximum possible points for this section
}

/** Aggregate metrics computed across evaluations for a single form */
export interface EvalAggregateMetrics {
  formId: string;
  formTitle: string;
  passRate: number;         // 0–100
  averageScore: number;     // 0–100
  totalEvaluated: number;
  scoreDistribution: ScoreDistribution;
  perQuestionPassRates: Record<string, number>;
}

// --- ContactLensClient return type ---

/** Return type for fetchTranscriptSegments (S3-only with awaiting_analysis support) */
export interface FetchTranscriptResult {
  status: "ready" | "awaiting_analysis";
  segments?: TranscriptSegment[];
}
