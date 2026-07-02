// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  SearchEvaluationFormsCommand,
  StartContactEvaluationCommand,
  DescribeContactEvaluationCommand,
} from "@aws-sdk/client-connect";
import type { AWSCredentials } from "../credentials/types";
import type { EvaluationFormSummary, ContactEvaluation, EvaluationAnswer, SectionScore } from "./types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

// ─── Parameter Types ─────────────────────────────────────────────────────────

export interface SearchFormsParams {
  instanceId: string;
  credentials: AWSCredentials;
  region: string;
  signal?: AbortSignal;
}

export interface StartEvaluationParams {
  instanceId: string;
  contactId: string;
  evaluationFormId: string;
  credentials: AWSCredentials;
  region: string;
  signal?: AbortSignal;
}

export interface DescribeEvaluationParams {
  instanceId: string;
  evaluationId: string;
  credentials: AWSCredentials;
  region: string;
  signal?: AbortSignal;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createConnectClient(credentials: AWSCredentials, region: string): ConnectClient {
  return new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

// ─── searchForms ─────────────────────────────────────────────────────────────

/**
 * Searches evaluation forms filtered by the "created-by: ai-agents-lab" tag.
 * Paginates through all results and returns summaries.
 */
export async function searchForms(params: SearchFormsParams): Promise<EvaluationFormSummary[]> {
  const { instanceId, credentials, region, signal } = params;
  const client = createConnectClient(credentials, region);

  const forms: EvaluationFormSummary[] = [];
  let nextToken: string | undefined;

  do {
    if (signal?.aborted) throw new Error("Aborted");

    const response = await withRetry(
      () =>
        client.send(
          new SearchEvaluationFormsCommand({
            InstanceId: instanceId,
            NextToken: nextToken,
            MaxResults: 100,
            SearchFilter: {
              AttributeFilter: {
                TagCondition: {
                  TagKey: "created-by",
                  TagValue: "ai-agents-lab",
                },
              },
            },
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    if (response.EvaluationFormSearchSummaryList) {
      for (const form of response.EvaluationFormSearchSummaryList) {
        forms.push({
          evaluationFormId: form.EvaluationFormId ?? "",
          title: form.Title ?? "",
          lastActivatedTime: form.LastActivatedTime
            ? new Date(form.LastActivatedTime).getTime()
            : 0,
          autoEvaluationEnabled: form.AutoEvaluationEnabled ?? false,
        });
      }
    }

    nextToken = response.NextToken ?? undefined;
  } while (nextToken);

  return forms;
}

// ─── startEvaluation ─────────────────────────────────────────────────────────

/**
 * Starts a contact evaluation with auto-evaluation enabled.
 * Returns the EvaluationId.
 */
export async function startEvaluation(params: StartEvaluationParams): Promise<string> {
  const { instanceId, contactId, evaluationFormId, credentials, region, signal } = params;
  const client = createConnectClient(credentials, region);

  if (signal?.aborted) throw new Error("Aborted");

  const response = await withRetry(
    () =>
      client.send(
        new StartContactEvaluationCommand({
          InstanceId: instanceId,
          ContactId: contactId,
          EvaluationFormId: evaluationFormId,
          AutoEvaluationConfiguration: { Enabled: true },
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  return response.EvaluationId!;
}

// ─── describeEvaluation ──────────────────────────────────────────────────────

/**
 * Describes a contact evaluation and maps the response to our ContactEvaluation type.
 * Extracts score from Metadata.Score.Percentage, answers with GenAI justification,
 * and per-section scores.
 */
export async function describeEvaluation(params: DescribeEvaluationParams): Promise<ContactEvaluation> {
  const { instanceId, evaluationId, credentials, region, signal } = params;
  const client = createConnectClient(credentials, region);

  if (signal?.aborted) throw new Error("Aborted");

  const response = await withRetry(
    () =>
      client.send(
        new DescribeContactEvaluationCommand({
          InstanceId: instanceId,
          EvaluationId: evaluationId,
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const evaluation = response.Evaluation!;
  const evaluationForm = response.EvaluationForm!;
  const metadata = evaluation.Metadata!;

  // Map SDK status + auto-evaluation status → our status type
  const status = mapEvaluationStatus(evaluation.Status, metadata.AutoEvaluation);

  // Extract overall score
  const score = metadata.Score?.Percentage != null
    ? Math.round(metadata.Score.Percentage * 100) / 100
    : undefined;

  // Extract per-question answers with justifications from the form structure
  const answers = mapAnswers(evaluation.Answers, evaluationForm.Items, evaluation.Scores);

  // Extract per-section scores from the Scores map and form structure
  const sectionScores = mapSectionScores(evaluation.Scores, evaluationForm.Items);

  // Build error message for failed evaluations
  const error = status === "failed"
    ? "Auto-evaluation failed"
    : undefined;

  return {
    evaluationId,
    contactId: metadata.ContactId ?? "",
    evaluationFormId: evaluationForm.EvaluationFormId ?? "",
    status,
    score,
    answers: status === "completed" ? answers : undefined,
    sectionScores: status === "completed" ? sectionScores : undefined,
    error,
  };
}

// ─── Internal Mapping Helpers ────────────────────────────────────────────────

type AutoEvalDetails = {
  AutoEvaluationEnabled?: boolean;
  AutoEvaluationStatus?: string;
};

function mapEvaluationStatus(
  sdkStatus: string | undefined,
  autoEval: AutoEvalDetails | undefined
): ContactEvaluation["status"] {
  const autoStatus = autoEval?.AutoEvaluationStatus;

  // If auto-evaluation explicitly failed
  if (autoStatus === "FAILED") return "failed";

  // If submitted with auto-eval succeeded → completed
  if (sdkStatus === "SUBMITTED" && autoStatus === "SUCCEEDED") return "completed";

  // If auto-evaluation is in progress
  if (autoStatus === "IN_PROGRESS") return "in_progress";

  // DRAFT status typically means evaluation just started
  if (sdkStatus === "DRAFT") return "in_progress";

  // SUBMITTED without auto-eval → completed (manual evaluation)
  if (sdkStatus === "SUBMITTED") return "completed";

  return "pending";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAnswers(answersMap: any, formItems: any[] | undefined, scoresMap: any): EvaluationAnswer[] {
  if (!answersMap || !formItems) return [];

  // Build a lookup of question metadata from form items (recursive through sections)
  const questionMeta: Map<string, { title: string; sectionTitle: string }> = new Map();
  buildQuestionLookup(formItems, "", questionMeta);

  const answers: EvaluationAnswer[] = [];

  for (const [refId, answer] of Object.entries(answersMap)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const answerData = answer as any;
    const meta = questionMeta.get(refId);

    // Extract the answer value (string representation)
    const value = extractAnswerValue(answerData.Value);

    // Extract justification from SuggestedAnswers GenAI analysis
    const justification = extractJustification(answerData.SuggestedAnswers);

    // Extract score from the Scores map (keyed by refId, same as sections)
    let score = 0;
    const scoreEntry = scoresMap?.[refId];
    if (scoreEntry?.Percentage != null) {
      score = Math.round(scoreEntry.Percentage * 100) / 100;
    } else if (answerData.Value?.NotApplicable) {
      score = 0;
    }

    answers.push({
      questionRefId: refId,
      questionTitle: meta?.title ?? refId,
      sectionTitle: meta?.sectionTitle ?? "",
      value,
      score,
      justification,
    });
  }

  return answers;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildQuestionLookup(items: any[], parentSectionTitle: string, lookup: Map<string, { title: string; sectionTitle: string }>) {
  if (!items) return;

  for (const item of items) {
    if (item.Section) {
      const sectionTitle = item.Section.Title ?? "";
      buildQuestionLookup(item.Section.Items ?? [], sectionTitle, lookup);
    }
    if (item.Question) {
      lookup.set(item.Question.RefId, {
        title: item.Question.Title ?? item.Question.RefId,
        sectionTitle: parentSectionTitle,
      });
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAnswerValue(value: any): string {
  if (!value) return "";
  if (value.NotApplicable) return "N/A";
  if (value.StringValue != null) return value.StringValue;
  if (value.NumericValue != null) return String(value.NumericValue);
  if (value.StringValues && value.StringValues.length > 0) return value.StringValues.join(", ");
  if (value.DateTimeValue != null) return value.DateTimeValue;
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJustification(suggestedAnswers: any[] | undefined): string | undefined {
  if (!suggestedAnswers || suggestedAnswers.length === 0) return undefined;

  // Find the first GenAI suggestion with a justification
  for (const suggestion of suggestedAnswers) {
    const genAi = suggestion.AnalysisDetails?.GenAI;
    if (genAi?.Justification) {
      return genAi.Justification;
    }
  }

  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSectionScores(scoresMap: any, formItems: any[] | undefined): SectionScore[] {
  if (!scoresMap || !formItems) return [];

  const sectionScores: SectionScore[] = [];

  // Extract section-level scores — the Scores map keys are RefIds (both sections and questions)
  for (const item of formItems) {
    if (item.Section) {
      const refId = item.Section.RefId;
      const scoreEntry = scoresMap[refId];
      if (scoreEntry && scoreEntry.Percentage != null) {
        sectionScores.push({
          sectionRefId: refId,
          sectionTitle: item.Section.Title ?? refId,
          percentage: Math.round(scoreEntry.Percentage * 100) / 100,
          earnedPoints: scoreEntry.EarnedPoints ?? 0,
          maxBasePoint: scoreEntry.MaxBasePoint ?? 0,
        });
      }
    }
  }

  return sectionScores;
}
