// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Static registry of IAM permissions required by the application,
 * grouped by feature area.
 *
 * All permissions are verified via IAM SimulatePrincipalPolicy — no direct
 * API probing needed.
 */

export type PermissionStatus = "granted" | "denied" | "unknown" | "not-verifiable" | "pending";

export interface PermissionEntry {
  /** IAM action, e.g. "connect:ListInstances" */
  action: string;
  /** Human-readable description of what this permission enables */
  description: string;
}

export interface PermissionGroup {
  /** Unique identifier for the group */
  id: string;
  /** Display name */
  name: string;
  /** Short description of the feature area */
  description: string;
  /** Ordered list of permissions in this group */
  permissions: PermissionEntry[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "workspace",
    name: "Workspace Discovery",
    description: "Discover Connect instances and Amazon Connect AI Agents assistants across regions.",
    permissions: [
      {
        action: "connect:ListInstances",
        description: "List Connect instances in each region",
      },
      {
        action: "wisdom:ListAssistants",
        description: "List Amazon Connect AI Agents assistants for an instance",
      },
    ],
  },
  {
    id: "contacts",
    name: "Contacts",
    description: "Search and inspect contact records to view AI session traces.",
    permissions: [
      {
        action: "connect:SearchContacts",
        description: "Search contacts by time range",
      },
      {
        action: "connect:DescribeContact",
        description: "Get contact details including WisdomInfo",
      },
    ],
  },
  {
    id: "spans",
    name: "Spans & Sessions",
    description: "View span traces and AI agent details for sessions.",
    permissions: [
      {
        action: "wisdom:ListSpans",
        description: "Fetch span traces for a session",
      },
      {
        action: "wisdom:ListAIAgents",
        description: "List customer-facing AI agents",
      },
    ],
  },
  {
    id: "testing-chat",
    name: "Testing — Chat",
    description: "Start and manage chat test sessions with AI agents.",
    permissions: [
      {
        action: "connect:StartChatContact",
        description: "Initiate a chat contact for testing",
      },
      {
        action: "connect-participant:CreateParticipantConnection",
        description: "Establish WebSocket connection for chat",
      },
      {
        action: "connect-participant:SendMessage",
        description: "Send messages during a chat session",
      },
      {
        action: "connect-participant:DisconnectParticipant",
        description: "End a chat session",
      },
    ],
  },
  {
    id: "testing-voice",
    name: "Testing — Voice",
    description: "Start WebRTC voice calls with AI agents.",
    permissions: [
      {
        action: "connect:StartWebRTCContact",
        description: "Initiate a WebRTC voice contact for testing",
      },
    ],
  },
  {
    id: "testing-speech",
    name: "Testing — Speech Synthesis",
    description: "Use Amazon Polly to generate speech for voice testing.",
    permissions: [
      {
        action: "polly:DescribeVoices",
        description: "List available Polly voices",
      },
      {
        action: "polly:SynthesizeSpeech",
        description: "Generate speech audio from text",
      },
    ],
  },
  {
    id: "testing-variations",
    name: "Testing — Variation Generation",
    description: "Generate utterance paraphrase variations via Amazon Bedrock (Claude Haiku 4.5) for batch robustness testing.",
    permissions: [
      {
        action: "bedrock:InvokeModel",
        description: "Invoke Claude Haiku 4.5 to generate paraphrase variations for each script turn",
      },
    ],
  },
  {
    id: "evaluations",
    name: "Evaluations",
    description: "Run LLM-judge evaluations against Contact Lens transcripts.",
    permissions: [
      {
        action: "connect:ListRealtimeContactAnalysisSegmentsV2",
        description: "Fetch real-time Contact Lens transcript segments (available ~24h after contact ends)",
      },
      {
        action: "connect:DescribeContact",
        description: "Retrieve contact channel, timestamp and S3 bucket location for the CL analysis file",
      },
      {
        action: "s3:GetObject",
        description: "Download post-call Contact Lens analysis JSON from S3 (fallback when real-time segments have expired)",
      },
      {
        action: "s3:ListBucket",
        description: "Search for Contact Lens analysis file by prefix when exact key is unknown",
      },
      {
        action: "bedrock:InvokeModel",
        description: "Invoke a Bedrock model to judge agent responses",
      },
      {
        action: "connect:CreateEvaluationForm",
        description: "Create an evaluation form in Connect",
      },
      {
        action: "connect:ActivateEvaluationForm",
        description: "Activate an evaluation form for use",
      },
      {
        action: "connect:SearchEvaluationForms",
        description: "Search for evaluation forms available on the instance",
      },
      {
        action: "connect:StartContactEvaluation",
        description: "Start an automated evaluation for a contact",
      },
      {
        action: "connect:DescribeContactEvaluation",
        description: "Retrieve evaluation results and scores",
      },
      {
        action: "connect:ListContactEvaluations",
        description: "List evaluations for a given contact",
      },
    ],
  },
  {
    id: "testing-setup",
    name: "Testing — Infrastructure Setup",
    description: "One-time provisioning of Lex bot and contact flow for the test harness.",
    permissions: [
      {
        action: "lex:ListBots",
        description: "Detect existing test harness bot",
      },
      {
        action: "lex:DescribeBot",
        description: "Check bot status",
      },
      {
        action: "lex:ListBotAliases",
        description: "Resolve bot alias ARN",
      },
      {
        action: "lex:ListBuiltInIntents",
        description: "Discover QinConnect intent signature",
      },
      {
        action: "lex:CreateBot",
        description: "Create the test harness Lex bot",
      },
      {
        action: "lex:CreateBotLocale",
        description: "Create bot locale (en_US)",
      },
      {
        action: "lex:CreateIntent",
        description: "Create QinConnect intent on the bot",
      },
      {
        action: "lex:BuildBotLocale",
        description: "Build the bot locale after intent creation",
      },
      {
        action: "lex:DescribeBotLocale",
        description: "Poll locale build status",
      },
      {
        action: "lex:CreateBotVersion",
        description: "Create a versioned snapshot of the bot",
      },
      {
        action: "lex:CreateBotAlias",
        description: "Create a bot alias for Connect integration",
      },
      {
        action: "lex:TagResource",
        description: "Tag bot for Connect association",
      },
      {
        action: "connect:AssociateBot",
        description: "Associate Lex bot with Connect instance",
      },
      {
        action: "connect:ListContactFlows",
        description: "Check for existing test harness contact flow",
      },
      {
        action: "connect:CreateContactFlow",
        description: "Create the test harness contact flow",
      },
      {
        action: "connect:UpdateContactFlowContent",
        description: "Update existing contact flow content",
      },
    ],
  },
];
