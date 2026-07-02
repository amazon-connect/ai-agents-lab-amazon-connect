// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { HelpIcon } from "../contextual-help";

const EVALUATION_MODEL_ID_KEY = "evaluation-model-id";
const DEFAULT_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

function getStoredModelId(): string {
  return localStorage.getItem(EVALUATION_MODEL_ID_KEY) || DEFAULT_MODEL_ID;
}

export default function EvaluationSettingsPage() {
  const [modelId, setModelId] = useState<string>(getStoredModelId);
  const [saved, setSaved] = useState(false);

  // Track whether there are unsaved changes
  const hasChanges = modelId !== getStoredModelId();

  const handleSave = () => {
    if (modelId.trim() === "") {
      localStorage.removeItem(EVALUATION_MODEL_ID_KEY);
    } else {
      localStorage.setItem(EVALUATION_MODEL_ID_KEY, modelId);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Configure the LLM judge used for evaluation scoring">
          Evaluation settings
        </Header>
      }
    >
      <Container header={<Header variant="h2">LLM Judge</Header>}>
        <SpaceBetween size="l">
          <FormField
            label={
              <span>
                Model ID{" "}
                <HelpIcon anchorId="evaluation-model-id" pageId="settings" fieldName="Model ID" />
              </span>
            }
            description="The Amazon Bedrock model used to evaluate agent responses. The evaluation prompt is fixed internally and uses a checkpoint-based evaluation approach."
          >
            <Input
              value={modelId}
              onChange={({ detail }) => setModelId(detail.value)}
              placeholder={DEFAULT_MODEL_ID}
            />
          </FormField>

          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <Button variant="primary" onClick={handleSave} disabled={!hasChanges}>
              Save
            </Button>
            {saved && (
              <Box variant="small" color="text-status-success">
                Saved
              </Box>
            )}
          </SpaceBetween>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
