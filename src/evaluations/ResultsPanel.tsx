// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import { classifyVerdict } from "./summary-metrics";
import type {
  ContactEvaluation,
  EvaluationAnswer,
  SectionScore,
  TranscriptSegment,
  Verdict,
} from "./types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ResultsPanelProps {
  contactId: string;
  evaluation: ContactEvaluation;
  transcript: TranscriptSegment[] | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function verdictColor(verdict: Verdict): string {
  switch (verdict) {
    case "pass":
      return "#037f0c";
    case "partial":
      return "#8d6605";
    case "fail":
      return "#d91515";
  }
}

function verdictIndicatorType(verdict: Verdict): "success" | "warning" | "error" {
  switch (verdict) {
    case "pass":
      return "success";
    case "partial":
      return "warning";
    case "fail":
      return "error";
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function OverallScoreBadge({ score }: { score: number }) {
  const verdict = classifyVerdict(score);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 12px",
        borderRadius: "4px",
        backgroundColor: `${verdictColor(verdict)}14`,
        border: `1px solid ${verdictColor(verdict)}`,
      }}
    >
      <StatusIndicator type={verdictIndicatorType(verdict)}>
        {score}% — {verdict}
      </StatusIndicator>
    </span>
  );
}

function SectionScoresList({ sections }: { sections: SectionScore[] }) {
  if (sections.length === 0) return null;
  return (
    <Container header={<Header variant="h3">Section Scores</Header>}>
      <SpaceBetween size="xs">
        {sections.map((section) => {
          const sectionPercent = section.maxBasePoint > 0
            ? Math.round((section.earnedPoints / section.maxBasePoint) * 100)
            : 0;
          const verdict = classifyVerdict(sectionPercent);
          return (
            <Box key={section.sectionRefId} variant="div">
              <SpaceBetween direction="horizontal" size="xs">
                <Box variant="span" fontWeight="bold">
                  {section.sectionTitle}
                </Box>
                <StatusIndicator type={verdictIndicatorType(verdict)}>
                  {section.earnedPoints}/{section.maxBasePoint} ({sectionPercent}%)
                </StatusIndicator>
              </SpaceBetween>
            </Box>
          );
        })}
      </SpaceBetween>
    </Container>
  );
}

function QuestionsAccordion({ answers }: { answers: EvaluationAnswer[] }) {
  if (answers.length === 0) return null;
  return (
    <Container header={<Header variant="h3">Questions</Header>}>
      <SpaceBetween size="xs">
        {answers.map((answer) => {
          const verdict = classifyVerdict(answer.score);
          return (
            <ExpandableSection
              key={answer.questionRefId}
              variant="default"
              headerText={`${answer.questionTitle} — ${answer.value} (${answer.score}%)`}
            >
              <SpaceBetween size="s">
                <Box variant="div">
                  <SpaceBetween direction="horizontal" size="xs">
                    <Box variant="span" fontWeight="bold">
                      Section:
                    </Box>
                    <Box variant="span">{answer.sectionTitle}</Box>
                  </SpaceBetween>
                </Box>
                <Box variant="div">
                  <SpaceBetween direction="horizontal" size="xs">
                    <Box variant="span" fontWeight="bold">
                      Score:
                    </Box>
                    <StatusIndicator type={verdictIndicatorType(verdict)}>
                      {answer.score}%
                    </StatusIndicator>
                  </SpaceBetween>
                </Box>
                {answer.justification && (
                  <Box variant="div">
                    <Box variant="span" fontWeight="bold">
                      Justification:
                    </Box>
                    <Box variant="p" color="text-body-secondary">
                      {answer.justification}
                    </Box>
                  </Box>
                )}
              </SpaceBetween>
            </ExpandableSection>
          );
        })}
      </SpaceBetween>
    </Container>
  );
}

function TranscriptSection({ segments }: { segments: TranscriptSegment[] }) {
  return (
    <ExpandableSection headerText="Transcript" variant="default">
      <SpaceBetween size="xxs">
        {segments.map((seg, idx) => (
          <Box key={idx} variant="div" padding={{ vertical: "xxs" }}>
            <Box variant="span" fontWeight="bold">
              {seg.participantRole}:
            </Box>{" "}
            <Box variant="span">{seg.displayText}</Box>
          </Box>
        ))}
      </SpaceBetween>
    </ExpandableSection>
  );
}

function EvaluationDetail({ evaluation }: { evaluation: ContactEvaluation }) {
  if (evaluation.status !== "completed" || evaluation.score == null) {
    return (
      <Box variant="p" color="text-status-inactive" textAlign="center">
        Evaluation {evaluation.status === "failed" ? "failed" : "in progress"}
        {evaluation.error && `: ${evaluation.error}`}
      </Box>
    );
  }

  return (
    <SpaceBetween size="l">
      {/* Overall score badge */}
      <Container header={<Header variant="h3">Overall Score</Header>}>
        <OverallScoreBadge score={evaluation.score} />
      </Container>

      {/* Section scores */}
      {evaluation.sectionScores && evaluation.sectionScores.length > 0 && (
        <SectionScoresList sections={evaluation.sectionScores} />
      )}

      {/* Per-question accordion */}
      {evaluation.answers && evaluation.answers.length > 0 && (
        <QuestionsAccordion answers={evaluation.answers} />
      )}
    </SpaceBetween>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ResultsPanel({
  contactId,
  evaluation,
  transcript,
}: ResultsPanelProps) {
  return (
    <SpaceBetween size="l">
      <Header variant="h2">Evaluation Results — {contactId}</Header>

      <EvaluationDetail evaluation={evaluation} />

      {/* Transcript section at the bottom */}
      {transcript && transcript.length > 0 && (
        <TranscriptSection segments={transcript} />
      )}
    </SpaceBetween>
  );
}
