// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type {
  ContactEvaluation,
  EvalAggregateMetrics,
  EvaluationFormSummary,
  ScoreDistribution,
  Verdict,
} from "./types";

/**
 * Classify a numeric score (0–100) into a verdict.
 * - score >= 90 → "pass"
 * - 50 <= score < 90 → "partial"
 * - score < 50 → "fail"
 */
export function classifyVerdict(score: number): Verdict {
  if (score >= 90) return "pass";
  if (score >= 50) return "partial";
  return "fail";
}

/**
 * Compute per-form aggregate metrics from completed evaluations.
 *
 * Only evaluations with status "completed" and a defined score are included.
 * Returns one EvalAggregateMetrics per form that has at least one completed evaluation.
 */
export function computeAggregateMetrics(
  evaluations: ContactEvaluation[],
  forms: EvaluationFormSummary[]
): EvalAggregateMetrics[] {
  const formMap = new Map(forms.map((f) => [f.evaluationFormId, f]));
  const grouped = new Map<string, ContactEvaluation[]>();

  for (const ev of evaluations) {
    if (ev.status !== "completed" || ev.score == null) continue;
    const list = grouped.get(ev.evaluationFormId) ?? [];
    list.push(ev);
    grouped.set(ev.evaluationFormId, list);
  }

  const results: EvalAggregateMetrics[] = [];

  for (const [formId, completed] of grouped) {
    const form = formMap.get(formId);
    const formTitle = form?.title ?? formId;
    const totalEvaluated = completed.length;

    // Pass rate: score >= 90
    const passCount = completed.filter((e) => e.score! >= 90).length;
    const passRate = (passCount / totalEvaluated) * 100;

    // Average score
    const totalScore = completed.reduce((sum, e) => sum + e.score!, 0);
    const averageScore = totalScore / totalEvaluated;

    // Score distribution
    const scoreDistribution: ScoreDistribution = {
      bucket0to25: 0,
      bucket26to50: 0,
      bucket51to75: 0,
      bucket76to100: 0,
    };

    for (const ev of completed) {
      const score = ev.score!;
      if (score <= 25) scoreDistribution.bucket0to25++;
      else if (score <= 50) scoreDistribution.bucket26to50++;
      else if (score <= 75) scoreDistribution.bucket51to75++;
      else scoreDistribution.bucket76to100++;
    }

    // Per-question pass rates
    const perQuestionPassRates: Record<string, number> = {};
    const questionCounts = new Map<string, { pass: number; total: number }>();

    for (const ev of completed) {
      if (!ev.answers) continue;
      for (const answer of ev.answers) {
        const entry = questionCounts.get(answer.questionRefId) ?? { pass: 0, total: 0 };
        entry.total++;
        if (answer.score >= 90) entry.pass++;
        questionCounts.set(answer.questionRefId, entry);
      }
    }

    for (const [questionId, { pass, total }] of questionCounts) {
      perQuestionPassRates[questionId] = (pass / total) * 100;
    }

    results.push({
      formId,
      formTitle,
      passRate,
      averageScore,
      totalEvaluated,
      scoreDistribution,
      perQuestionPassRates,
    });
  }

  return results;
}


