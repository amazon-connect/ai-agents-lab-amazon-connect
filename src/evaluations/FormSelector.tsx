// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Select from "@cloudscape-design/components/select";
import type { SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";

import type { AWSCredentials } from "../credentials/types";
import { searchForms } from "./evaluation-client";
import type { EvaluationFormSummary } from "./types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FormSelectorProps {
  instanceId: string;
  credentials: AWSCredentials;
  region: string;
  selectedFormId: string | null;
  onSelectionChange: (formId: string | null, title: string | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(epochMs: number): string {
  if (!epochMs) return "Unknown";

  const now = Date.now();
  const diffMs = now - epochMs;

  if (diffMs < 0) return "Just now";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return new Date(epochMs).toLocaleDateString();
  }
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

function buildOptions(forms: EvaluationFormSummary[]): SelectProps.Option[] {
  return forms.map((form) => ({
    label: form.title,
    value: form.evaluationFormId,
    description: `Activated ${formatRelativeTime(form.lastActivatedTime)}`,
    tags: form.autoEvaluationEnabled ? ["Auto-evaluation"] : undefined,
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FormSelector({
  instanceId,
  credentials,
  region,
  selectedFormId,
  onSelectionChange,
}: FormSelectorProps) {
  const [forms, setForms] = useState<EvaluationFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchForms = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await searchForms({
        instanceId,
        credentials,
        region,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setForms(result);
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : "Failed to fetch evaluation forms";
        setError(message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [instanceId, credentials, region]);

  useEffect(() => {
    fetchForms();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchForms]);

  const handleSelectionChange: SelectProps["onChange"] = ({ detail }) => {
    onSelectionChange(detail.selectedOption?.value ?? null, detail.selectedOption?.label ?? null);
  };

  const selectedOption: SelectProps.Option | null = selectedFormId
    ? forms
        .filter((f) => f.evaluationFormId === selectedFormId)
        .map((f) => ({ label: f.title, value: f.evaluationFormId }))[0] ?? null
    : null;

  // Loading state
  if (loading) {
    return (
      <Box textAlign="center" padding="l">
        <Spinner size="normal" /> Loading evaluation forms…
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        type="error"
        header="Failed to load evaluation forms"
        action={
          <Button onClick={fetchForms} iconName="refresh">
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  // Empty state
  if (forms.length === 0) {
    return (
      <Alert type="info">
        No evaluation forms found. Create forms from the Testing page.
      </Alert>
    );
  }

  // Normal state
  return (
    <SpaceBetween direction="horizontal" size="xs">
      <Select
        selectedOption={selectedOption}
        onChange={handleSelectionChange}
        options={buildOptions(forms)}
        placeholder="Select an evaluation form"
        filteringType="auto"
      />
      <Button iconName="refresh" variant="icon" onClick={fetchForms} ariaLabel="Refresh forms" />
    </SpaceBetween>
  );
}
