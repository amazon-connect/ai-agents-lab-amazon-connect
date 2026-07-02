// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { HelpIcon } from "../contextual-help";

const ANALYTICS_LANGUAGE_KEY = "analytics-language";
const DEFAULT_LANGUAGE = "en-US";

export const VARIATION_MODEL_ID_KEY = "variation-model-id";
export const DEFAULT_VARIATION_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

function getStoredLanguage(): string {
  return localStorage.getItem(ANALYTICS_LANGUAGE_KEY) || DEFAULT_LANGUAGE;
}

export function getStoredVariationModelId(): string {
  return localStorage.getItem(VARIATION_MODEL_ID_KEY) || DEFAULT_VARIATION_MODEL_ID;
}

export default function SettingsPage() {
  const [language, setLanguage] = useState<string>(getStoredLanguage);
  const [variationModelId, setVariationModelId] = useState<string>(getStoredVariationModelId);

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    localStorage.setItem(ANALYTICS_LANGUAGE_KEY, value);
  };

  const handleVariationModelIdChange = (value: string) => {
    setVariationModelId(value);
    if (value.trim() === "") {
      localStorage.removeItem(VARIATION_MODEL_ID_KEY);
    } else {
      localStorage.setItem(VARIATION_MODEL_ID_KEY, value);
    }
  };

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="Application configuration">
          Settings
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container
          header={<Header variant="h2">Test Harness</Header>}
        >
          <SpaceBetween size="l">
            <FormField
              label={
                <span>
                  Contact Lens language{" "}
                  <HelpIcon anchorId="analytics-language" pageId="settings" fieldName="Contact Lens language" />
                </span>
              }
              description='BCP-47 language code used for Contact Lens analytics (e.g., "en-US", "en-AU", "fr-FR")'
            >
              <Input
                value={language}
                onChange={({ detail }) => handleLanguageChange(detail.value)}
                placeholder="en-US"
              />
            </FormField>

            <FormField
              label={
                <span>
                  Variation generation model{" "}
                  <HelpIcon anchorId="variation-model-id" pageId="settings" fieldName="Variation generation model" />
                </span>
              }
              description="Amazon Bedrock model used to generate utterance variations. Use the cross-region inference prefix matching your region (us., eu., ap.)."
            >
              <Input
                value={variationModelId}
                onChange={({ detail }) => handleVariationModelIdChange(detail.value)}
                placeholder={DEFAULT_VARIATION_MODEL_ID}
              />
            </FormField>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
