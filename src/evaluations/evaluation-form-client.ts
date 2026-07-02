// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  CreateEvaluationFormCommand,
  ActivateEvaluationFormCommand,
} from "@aws-sdk/client-connect";

export interface CreateFormParams {
  instanceId: string;
  title: string;
  description: string;
  items: unknown[];
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
  region: string;
}

export interface CreateFormResult {
  evaluationFormId: string;
  evaluationFormArn: string;
}

export interface ActivateFormParams {
  instanceId: string;
  evaluationFormId: string;
  evaluationFormVersion: number;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
  region: string;
}

/**
 * Create an evaluation form in Amazon Connect.
 * Includes Tags, TargetConfiguration, AutoEvaluationConfiguration, and ScoringStrategy.
 * Creates a new ConnectClient per call to ensure region/credentials are current.
 * Strips Weight fields from items since QUESTION_ONLY scoring mode does not support them.
 */
export async function createEvaluationForm(
  params: CreateFormParams
): Promise<CreateFormResult> {
  const { instanceId, title, description, items, credentials, region } = params;

  const client = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // QUESTION_ONLY scoring mode does not allow Weight on sections or questions
  const cleanedItems = stripWeights(items);

  const command = new CreateEvaluationFormCommand({
    InstanceId: instanceId,
    Title: title,
    Description: description,
    Items: cleanedItems as CreateEvaluationFormCommand["input"]["Items"],
    Tags: { "created-by": "ai-agents-lab" },
    TargetConfiguration: { ContactInteractionType: "AUTOMATED" },
    AutoEvaluationConfiguration: { Enabled: true },
    ScoringStrategy: { Mode: "QUESTION_ONLY", Status: "ENABLED" },
  });

  const response = await client.send(command);

  if (!response.EvaluationFormId || !response.EvaluationFormArn) {
    throw new Error("CreateEvaluationForm response missing EvaluationFormId or EvaluationFormArn");
  }

  return {
    evaluationFormId: response.EvaluationFormId,
    evaluationFormArn: response.EvaluationFormArn,
  };
}

/**
 * Recursively strip all "Weight" fields from the items structure.
 * Connect's QUESTION_ONLY scoring mode does not allow weights on sections or questions.
 */
function stripWeights(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => stripWeights(item));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "Weight") continue;
      result[key] = stripWeights(value);
    }
    return result;
  }

  return obj;
}

/**
 * Activate an evaluation form (makes it available for use).
 * Creates a new ConnectClient per call to ensure region/credentials are current.
 */
export async function activateEvaluationForm(
  params: ActivateFormParams
): Promise<void> {
  const { instanceId, evaluationFormId, evaluationFormVersion, credentials, region } = params;

  const client = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const command = new ActivateEvaluationFormCommand({
    InstanceId: instanceId,
    EvaluationFormId: evaluationFormId,
    EvaluationFormVersion: evaluationFormVersion,
  });

  await client.send(command);
}
