// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { HelpRegistry } from "./types";

export const HELP_REGISTRY: HelpRegistry = {
  "testing": [
    {
      id: "ai-agent",
      title: "AI Agent",
      body: [
        "An AI Agent is an Amazon Connect configuration that handles customer conversations using a specific Amazon Bedrock model and prompt.",
        "The list is filtered to customer-facing agents associated with the selected Connect assistant.",
      ],
    },
    {
      id: "script-yaml",
      title: "Test Script (YAML)",
      body: [
        "A multi-turn conversation script defined in YAML. The top-level name field labels the script. The turns array contains one entry per conversation turn.",
        "Each turn requires a customer field with the utterance text. An optional variations array provides alternative phrasings for batch testing.",
      ],
      links: [
        { text: "YAML specification", href: "https://yaml.org/spec/1.2.2/" },
      ],
    },
    {
      id: "variation-temperature",
      title: "Temperature",
      body: [
        "Controls how creative the model is when generating paraphrases. A value of 0.0 produces the most predictable, conservative phrasings. A value of 1.0 produces more diverse and sometimes unexpected alternatives.",
        "For most scripts, 0.5–0.7 gives a good balance of diversity without drifting too far from the original intent.",
      ],
    },
    {
      id: "generate-variations",
      title: "Generate variations",
      body: [
        "Enriches your script with alternative phrasings for each customer turn before running a batch. The full conversation is sent to Amazon Bedrock (Claude Haiku) in a single call, so the model has full context and can generate coherent paraphrases across turns.",
        "During batch execution, each iteration randomly picks one utterance per turn from the pool of original + variations, testing your agent's robustness across natural language diversity.",
        "To use this feature, load a valid script and enable Batch mode first. After generation you can review the enriched YAML in the textarea, edit it if needed, and export it to reuse in future sessions.",
      ],
    },
    {
      id: "latency-chart",
      title: "Latency distribution chart",
      body: [
        "A histogram showing how iteration execution times are distributed across duration buckets. Each bar represents the number of iterations that completed within that time range.",
        "Bucket size is chosen automatically based on the spread of your data: 0.5s buckets when the range is under 5s, 1s buckets up to 15s, 5s buckets up to 60s, and 10s buckets beyond that.",
        "Only iterations that completed successfully with a transcript are included. Failed or stopped iterations are excluded from the chart.",
        "The p50 and p95 values shown above the chart represent the median and 95th percentile execution times — useful for understanding typical vs. worst-case latency.",
      ],
    },
    {
      id: "settle-duration",
      title: "Settle duration",
      body: [
        "Controls how long the runner waits after receiving an agent message before deciding the turn is complete and sending the next customer utterance.",
        "Agents sometimes send multi-part responses — a short acknowledgement followed by the actual answer, for example. The settle timer gives those additional messages time to arrive before the runner moves on.",
        "A lower value (1–2s) makes scripts run faster but risks cutting a turn short if the agent pauses between messages. A higher value (5–10s) is safer for agents with multi-part responses but increases total run time.",
        "The default is 5 seconds. If your scripts finish early and miss the tail of an agent response, try increasing this value.",
      ],
    },
    {
      id: "voice-selection",
      title: "Customer voice",
      body: [
        "The Amazon Polly voice used to synthesize customer utterances into audio before streaming them to the agent.",
        "Voices are grouped by language. The generative engine produces the most natural-sounding speech. If generative voices are unavailable in your region, neural voices are used as a fallback.",
        "Different voices have different speech characteristics (pace, pitch, accent) which may affect how the agent interprets utterances — useful for testing robustness across voice types.",
      ],
    },
    {
      id: "silence-threshold",
      title: "Silence threshold",
      body: [
        "Controls how long the system waits for continuous silence before deciding the agent has finished speaking and advancing to the next scripted turn.",
        "A lower value (2–3s) makes tests run faster but risks cutting off the agent mid-response if it pauses between sentences. A higher value (5–10s) is safer for agents that think longer or produce multi-part responses, but increases total test duration.",
        "If your batch runs show unexpected max_timeout failures or incomplete agent responses, try increasing this value. If tests are running too slowly with long pauses between turns, try decreasing it.",
      ],
    },
  ],

  "credential-setup": [
    {
      id: "aws-account",
      title: "AWS Account",
      body: [
        "The AWS account that contains your Amazon Connect instance.",
        "The list is populated from the accounts accessible to your AWS IAM Identity Center (SSO) user.",
      ],
    },
    {
      id: "iam-role",
      title: "IAM Role",
      body: [
        "The IAM role assumed to access Connect and Amazon Bedrock APIs.",
        "The role must have the necessary permissions for the selected account, including connect:*, bedrock:InvokeModel, and qconnect:* as appropriate.",
      ],
    },
  ],

  "settings": [
    {
      id: "variation-model-id",
      title: "Variation generation model",
      body: [
        "The Amazon Bedrock model used to generate utterance paraphrases for batch variation testing.",
        "The model ID must use the cross-region inference prefix for your region: us. for US regions, eu. for Europe, ap. for Asia Pacific. For example: eu.anthropic.claude-haiku-4-5-20251001-v1:0.",
        "Changes take effect on the next variation generation run. Leave empty to use the default (us.anthropic.claude-haiku-4-5-20251001-v1:0).",
      ],
      links: [
        {
          text: "Supported models — Amazon Bedrock",
          href: "https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html",
        },
      ],
    },
    {
      id: "analytics-language",
      title: "Contact Lens language",
      body: [
        "The BCP-47 locale code that Contact Lens uses for speech-to-text transcription and text analytics when processing your test contacts.",
        "This value is injected into the test harness contact flow at provisioning time. It determines the language model Contact Lens applies for transcript generation, sentiment analysis, and keyword detection.",
        "Common values: en-US (US English), en-AU (Australian English), en-GB (British English), fr-FR (French), de-DE (German), es-US (US Spanish). The full list of supported languages depends on your Connect instance region.",
        "If you change this value, you must re-provision the test harness contact flow (via the Testing page setup) for the new language to take effect on future contacts.",
      ],
      links: [
        {
          text: "Supported languages — Contact Lens",
          href: "https://docs.aws.amazon.com/connect/latest/adminguide/supported-languages.html",
        },
      ],
    },
    {
      id: "evaluation-model-id",
      title: "Evaluation model ID",
      body: [
        "The Amazon Bedrock model identifier used by the LLM judge to score agent responses. This model receives the evaluation prompt along with the expected and actual responses for each turn.",
        "The default (Claude Haiku) offers a good balance of speed and quality for evaluation tasks. You can switch to a larger model (e.g., Claude Sonnet) for more nuanced judgements at the cost of higher latency and token usage.",
        "Leave empty to use the default model. Changes take effect on the next evaluation run.",
      ],
    },
    {
      id: "evaluation-prompt",
      title: "Evaluation prompt",
      body: [
        "The system prompt sent to the LLM judge for every turn evaluation. It instructs the model how to compare actual vs expected responses and what JSON format to return.",
        "The prompt must instruct the model to return JSON with three fields: verdict (pass/fail/partial), score (0–100), and rationale (explanation text).",
        "Customise this to adjust scoring sensitivity — for example, you might make the prompt stricter about exact wording, or more lenient about paraphrasing. Use 'Reset to default' to restore the built-in prompt.",
      ],
    },
  ],

  "evaluations": [
    {
      id: "evaluation-setup",
      title: "Setting up an evaluation",
      body: [
        "Evaluations measure how well your AI agent responds by scoring batch test contacts against structured evaluation forms using Connect's automated gen-AI evaluation.",
        "You need a batch results file (JSON export from a batch test run) and at least one evaluation form deployed to your Connect instance. Evaluation forms are created from the Testing page after a successful conversation.",
      ],
    },
    {
      id: "test-results-file",
      title: "Test results file",
      body: [
        "A JSON file exported from the Testing page after running a batch test. It contains the contact IDs for each completed iteration.",
        "The system uses these contact IDs to fetch the actual transcripts from Contact Lens, then triggers Connect's automated evaluation against your selected form(s).",
        "To generate this file: go to the Testing page, run a batch test, then click the export button in the results panel.",
      ],
    },
    {
      id: "evaluation-form",
      title: "Evaluation form",
      body: [
        "A structured Connect evaluation form with sections and questions designed to assess conversation milestones — observable outcomes in the transcript like information exchanged, steps completed, and decisions made.",
        "Forms are generated by an LLM from a successful chat conversation, then refined and deployed to Connect. All questions are answerable solely from the conversation transcript (no access to internal systems or knowledge bases).",
        "To create a form: go to the Testing page, have a satisfactory conversation, click ⋮ → Create evaluation form. Review, refine with natural language instructions, then Deploy.",
      ],
    },
    {
      id: "evaluation-scoring",
      title: "How scoring works",
      body: [
        "Connect's automated evaluation uses gen-AI to read the conversation transcript and answer each question in the evaluation form. Each question produces a score based on the selected answer option.",
        "The overall form score is derived from individual question scores (QUESTION_ONLY mode — all questions contribute equally). Scores 90–100 typically indicate pass, 50–89 partial, below 50 fail.",
        "You can customise the evaluation form questions and scoring using the refinement feature in the Testing page, or by editing the form JSON directly before deploying.",
      ],
    },
  ],

  "span-detail": [
    {
      id: "agent-identity",
      title: "Agent identity",
      body: [
        "Identifies the Connect AI agent that handled this invocation.",
        "Fields: Agent name (human-readable label), Agent ID (unique identifier), Version (deployed version number), Type (agent classification), Orchestrator use case (the configured use case for this agent).",
      ],
    },
    {
      id: "agent-context",
      title: "Agent context",
      body: [
        "Describes the Amazon Connect context in which the agent was invoked.",
        "Fields: Instance ARN (the Connect instance that initiated the contact), Contact ID (the unique identifier for this contact), Duration (total wall-clock time for the invoke_agent span).",
      ],
    },
    {
      id: "model-config",
      title: "Model configuration",
      body: [
        "Configuration and performance metrics for the Amazon Bedrock model call.",
        "Fields: Model ID (the Bedrock model identifier), Time to first token (latency until the first token was received), Temperature (sampling temperature used), Max tokens (token generation limit), Finish reason (why the model stopped generating).",
      ],
    },
    {
      id: "token-usage",
      title: "Token usage",
      body: [
        "Token consumption breakdown for this inference call.",
        "Fields: Input tokens (tokens in the prompt), Output tokens (tokens generated), Total tokens (input + output), Cache read tokens (tokens served from the prompt cache), Cache write tokens (tokens written to the prompt cache).",
      ],
    },
    {
      id: "prompt-metadata",
      title: "Prompt metadata",
      body: [
        "Identifies the managed prompt used for this inference call.",
        "Fields: Prompt name (human-readable label), Version (deployed prompt version), ARN (the full Amazon Bedrock prompt ARN).",
      ],
    },
    {
      id: "system-prompt",
      title: "System prompt",
      body: [
        "The system instruction sent to the model at the start of the conversation.",
        "This text sets the model's persona, constraints, and context before any user messages are processed.",
      ],
    },
    {
      id: "tool-info",
      title: "Tool info",
      body: [
        "Identifies the tool invoked during this execute_tool span.",
        "Fields: Tool name (the function or action called), Tool use ID (unique identifier for this specific invocation), Duration (wall-clock time for the tool execution).",
      ],
    },
  ],
};
