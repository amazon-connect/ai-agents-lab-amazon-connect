// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  LexModelsV2Client,
  ListBotsCommand,
  ListBotAliasesCommand,
  ListBuiltInIntentsCommand,
  CreateBotCommand,
  CreateBotLocaleCommand,
  CreateIntentCommand,
  BuildBotLocaleCommand,
  DescribeBotLocaleCommand,
  DescribeBotCommand,
  CreateBotVersionCommand,
  CreateBotAliasCommand,
  TagResourceCommand,
} from "@aws-sdk/client-lex-models-v2";
import {
  ConnectClient,
  ListContactFlowsCommand,
  CreateContactFlowCommand,
  UpdateContactFlowContentCommand,
  AssociateBotCommand,
} from "@aws-sdk/client-connect";
import type { AWSCredentials } from "../credentials/types";
import { withRetry, DEFAULT_RETRY_CONFIG, delay } from "../workspace/retry";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SetupState {
  status: "idle" | "detecting" | "ready" | "setup-required" | "provisioning" | "error";
  currentStep: ProvisioningStep | null;
  completedSteps: ProvisioningStep[];
  error: SetupError | null;
  infrastructure: TestHarnessInfrastructure | null;
}

export type ProvisioningStep =
  | "create-bot"
  | "create-locale"
  | "create-intent"
  | "build-locale"
  | "create-version"
  | "create-alias"
  | "tag-bot"
  | "associate-bot"
  | "create-flow";

export interface SetupError {
  step: ProvisioningStep | "detection";
  message: string;
  isPermissionError: boolean;
}

export interface TestHarnessInfrastructure {
  botId: string;
  botAliasArn: string;
  contactFlowId: string;
}

export interface DetectInfrastructureParams {
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  signal?: AbortSignal;
}

export interface ProvisionInfrastructureParams {
  credentials: AWSCredentials;
  region: string;
  instanceId: string;
  assistantArn: string;
  domainArn: string;
  signal?: AbortSignal;
  onStepChange?: (step: ProvisioningStep) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TAG_KEY = "test-harness-instance";
const FLOW_NAME = "test-harness-universal-flow";
const BOT_LOCALE_ID = "en_US";
const INTENT_NAME = "AmazonQinConnect";
const ALIAS_NAME = "production";
const BUILD_POLL_INTERVAL_MS = 5000;
const BUILD_TIMEOUT_MS = 120000;

// ─── Pure Functions ──────────────────────────────────────────────────────────

/**
 * Generate the bot name from an instance ID.
 * Pattern: `connect-test-harness-` + first 8 chars of instanceId.
 */
export function generateBotName(instanceId: string): string {
  return `connect-test-harness-${instanceId.slice(0, 8)}`;
}

/**
 * Inject ARNs and analytics language into the flow template, returning the populated JSON string.
 * Replaces all occurrences of {{LEX_BOT_ALIAS_ARN}}, {{ASSISTANT_ARN}}, {{DOMAIN_ARN}},
 * and {{ANALYTICS_LANGUAGE}}.
 */
export function injectFlowTemplate(
  template: string,
  botAliasArn: string,
  assistantArn: string,
  domainArn: string,
  analyticsLanguage: string
): string {
  const result = template
    .replace(/\{\{LEX_BOT_ALIAS_ARN\}\}/g, botAliasArn)
    .replace(/\{\{ASSISTANT_ARN\}\}/g, assistantArn)
    .replace(/\{\{DOMAIN_ARN\}\}/g, domainArn)
    .replace(/\{\{ANALYTICS_LANGUAGE\}\}/g, analyticsLanguage);

  // Validate no {{ANALYTICS_LANGUAGE}} placeholders remain
  if (/\{\{ANALYTICS_LANGUAGE\}\}/.test(result)) {
    throw new Error("Template still contains unreplaced {{ANALYTICS_LANGUAGE}} placeholders");
  }

  // Validate the result is valid JSON
  JSON.parse(result);
  return result;
}

// ─── Infrastructure Detection ────────────────────────────────────────────────

/**
 * Detect existing test harness infrastructure by tag lookup.
 * Paginates through all Lex bots, filters by name matching the expected bot name
 * for this instance. If found, resolves the alias ARN and flow ID.
 */
export async function detectInfrastructure(
  params: DetectInfrastructureParams
): Promise<TestHarnessInfrastructure | null> {
  const { credentials, region, instanceId, signal } = params;

  const lexClient = createLexClient(credentials, region);
  const connectClient = createConnectClient(credentials, region);

  const expectedBotName = generateBotName(instanceId);

  // Paginate through all bots to find one matching our naming convention
  let nextToken: string | undefined;
  let foundBotId: string | null = null;

  do {
    const listBotsResponse = await withRetry(
      () =>
        lexClient.send(
          new ListBotsCommand({
            filters: [
              {
                name: "BotName",
                values: [expectedBotName],
                operator: "CO",
              },
            ],
            nextToken,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const bots = listBotsResponse.botSummaries ?? [];
    for (const bot of bots) {
      if (bot.botName === expectedBotName && bot.botId) {
        foundBotId = bot.botId;
        break;
      }
    }

    if (foundBotId) break;
    nextToken = listBotsResponse.nextToken;
  } while (nextToken);

  if (!foundBotId) {
    return null;
  }

  // Get the account ID from DescribeBot (via roleArn)
  const describeBotResponse = await withRetry(
    () =>
      lexClient.send(
        new DescribeBotCommand({ botId: foundBotId! }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const accountId = extractAccountIdFromRoleArn(describeBotResponse.roleArn ?? "");

  // Resolve bot alias ARN via ListBotAliases
  const aliasResponse = await withRetry(
    () =>
      lexClient.send(
        new ListBotAliasesCommand({ botId: foundBotId! }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const alias = (aliasResponse.botAliasSummaries ?? []).find(
    (a) => a.botAliasName === ALIAS_NAME
  );

  if (!alias?.botAliasId) {
    return null;
  }

  const botAliasArn = buildBotAliasArn(region, accountId, foundBotId, alias.botAliasId);

  // Resolve contact flow ID via ListContactFlows filtered by name
  const flowId = await findContactFlowId(connectClient, instanceId, signal);
  if (!flowId) {
    return null;
  }

  return {
    botId: foundBotId,
    botAliasArn,
    contactFlowId: flowId,
  };
}

// ─── Infrastructure Provisioning ─────────────────────────────────────────────

/**
 * Provision the full test harness infrastructure (bot + flow).
 * Idempotent: if a bot with the expected name already exists, resumes from
 * the appropriate step rather than creating a new bot.
 */
export async function provisionInfrastructure(
  params: ProvisionInfrastructureParams
): Promise<TestHarnessInfrastructure> {
  const { credentials, region, instanceId, assistantArn, domainArn, signal, onStepChange } =
    params;

  const lexClient = createLexClient(credentials, region);
  const connectClient = createConnectClient(credentials, region);

  const botName = generateBotName(instanceId);
  const accountId = extractAccountIdFromArn(assistantArn);

  // Step 1: Create Bot (or reuse existing)
  onStepChange?.("create-bot");

  let botId: string;
  const existingBotId = await findExistingBot(lexClient, botName, signal);

  if (existingBotId) {
    // Bot already exists — reuse it
    botId = existingBotId;
    // Wait for it to be Available (in case it's still Creating from a previous attempt)
    await pollBotAvailable(lexClient, botId, signal);
  } else {
    const createBotResponse = await withRetry(
      () =>
        lexClient.send(
          new CreateBotCommand({
            botName,
            description: "Test harness bot for Connect AI Agent testing",
            // Service-linked role that Lex V2 creates automatically for Connect integrations.
            // Naming convention: AWSServiceRoleForLexV2Bots_AmazonConnect_<accountId>
            roleArn: `arn:aws:iam::${accountId}:role/aws-service-role/lexv2.amazonaws.com/AWSServiceRoleForLexV2Bots_AmazonConnect_${accountId}`,
            dataPrivacy: { childDirected: false },
            idleSessionTTLInSeconds: 300,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    botId = createBotResponse.botId!;

    // Wait for bot to become Available before creating locale
    await pollBotAvailable(lexClient, botId, signal);
  }

  // Step 2: Create Locale (skip if already exists)
  onStepChange?.("create-locale");
  try {
    await withRetry(
      () =>
        lexClient.send(
          new CreateBotLocaleCommand({
            botId,
            botVersion: "DRAFT",
            localeId: BOT_LOCALE_ID,
            nluIntentConfidenceThreshold: 0.4,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );
  } catch (err: unknown) {
    // Locale already exists — safe to continue
    if (!(err instanceof Error && (err.name === "ConflictException" || err.message.includes("already exists")))) {
      throw err;
    }
  }

  // Wait for locale to be ready (NotBuilt or Built) before creating intent
  await pollBotLocaleReady(lexClient, botId, signal);

  // Step 3: Create Intent (skip if already exists)
  onStepChange?.("create-intent");

  // Discover the correct QinConnect built-in intent signature for this locale
  const qinConnectSignature = await discoverQinConnectSignature(lexClient, signal);

  try {
    await withRetry(
      () =>
        lexClient.send(
          new CreateIntentCommand({
            botId,
            botVersion: "DRAFT",
            localeId: BOT_LOCALE_ID,
            intentName: INTENT_NAME,
            parentIntentSignature: qinConnectSignature,
            qInConnectIntentConfiguration: {
              qInConnectAssistantConfiguration: {
                assistantArn,
              },
            },
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );
  } catch (err: unknown) {
    // Intent already exists — safe to continue
    if (!(err instanceof Error && (err.name === "ConflictException" || err.message.includes("already exists")))) {
      throw err;
    }
  }

  // Step 4: Build Bot Locale (with polling)
  onStepChange?.("build-locale");
  await withRetry(
    () =>
      lexClient.send(
        new BuildBotLocaleCommand({
          botId,
          botVersion: "DRAFT",
          localeId: BOT_LOCALE_ID,
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  await pollBotLocaleBuild(lexClient, botId, signal);

  // Step 5: Create Version
  onStepChange?.("create-version");
  const versionResponse = await withRetry(
    () =>
      lexClient.send(
        new CreateBotVersionCommand({
          botId,
          botVersionLocaleSpecification: {
            [BOT_LOCALE_ID]: {
              sourceBotVersion: "DRAFT",
            },
          },
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const botVersion = versionResponse.botVersion!;

  // Wait for bot to be Available after version creation
  await pollBotAvailable(lexClient, botId, signal);

  // Step 6: Create Alias (skip if already exists)
  onStepChange?.("create-alias");
  let botAliasId: string;
  let botAliasArn: string;

  try {
    const aliasResponse = await withRetry(
      () =>
        lexClient.send(
          new CreateBotAliasCommand({
            botId,
            botAliasName: ALIAS_NAME,
            botVersion,
            botAliasLocaleSettings: {
              [BOT_LOCALE_ID]: {
                enabled: true,
              },
            },
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    botAliasId = aliasResponse.botAliasId!;
    botAliasArn = buildBotAliasArn(region, accountId, botId, botAliasId);
  } catch (err: unknown) {
    // Alias already exists — resolve it (Lex may throw ConflictException or other error with "already exists")
    if (err instanceof Error && (err.name === "ConflictException" || err.message.includes("already exists"))) {
      const existingAlias = await resolveExistingAlias(lexClient, botId, signal);
      botAliasId = existingAlias.botAliasId;
      botAliasArn = buildBotAliasArn(region, accountId, botId, botAliasId);
    } else {
      throw err;
    }
  }

  // Wait for bot to stabilize after alias creation
  await pollBotAvailable(lexClient, botId, signal);

  // Step 7: Tag Bot (idempotent — tagging an already-tagged resource is fine)
  onStepChange?.("tag-bot");
  const botArn = `arn:aws:lex:${region}:${accountId}:bot/${botId}`;
  await withRetry(
    () =>
      lexClient.send(
        new TagResourceCommand({
          resourceARN: botArn,
          tags: {
            AmazonConnectEnabled: "True",
            [TAG_KEY]: instanceId,
          },
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  // Step 8: Associate Bot with Connect (idempotent — re-associating is fine)
  onStepChange?.("associate-bot");
  await withRetry(
    () =>
      connectClient.send(
        new AssociateBotCommand({
          InstanceId: instanceId,
          LexV2Bot: {
            AliasArn: botAliasArn,
          },
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  // Step 9: Create Flow
  onStepChange?.("create-flow");
  const contactFlowId = await provisionContactFlow(
    connectClient,
    instanceId,
    botAliasArn,
    assistantArn,
    domainArn,
    signal
  );

  return {
    botId,
    botAliasArn,
    contactFlowId,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Create a LexModelsV2Client with the given credentials and region.
 */
function createLexClient(credentials: AWSCredentials, region: string): LexModelsV2Client {
  return new LexModelsV2Client({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

/**
 * Create a ConnectClient with the given credentials and region.
 */
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

/**
 * Build a Lex V2 bot alias ARN from its components.
 */
function buildBotAliasArn(
  region: string,
  accountId: string,
  botId: string,
  botAliasId: string
): string {
  return `arn:aws:lex:${region}:${accountId}:bot-alias/${botId}/${botAliasId}`;
}

/**
 * Extract account ID from an ARN string.
 * ARN format: arn:<partition>:<service>:<region>:<account-id>:<resource>
 */
function extractAccountIdFromArn(arn: string): string {
  const parts = arn.split(":");
  return parts[4] ?? "";
}

/**
 * Extract account ID from an IAM role ARN.
 * Role ARN format: arn:aws:iam::<account-id>:role/...
 */
function extractAccountIdFromRoleArn(roleArn: string): string {
  return extractAccountIdFromArn(roleArn);
}

/**
 * Discover the QinConnect built-in intent signature by listing all built-in intents
 * for the locale and finding the one containing "QinConnect" (case-insensitive).
 * This handles regional differences in signature naming.
 */
async function discoverQinConnectSignature(
  lexClient: LexModelsV2Client,
  signal?: AbortSignal
): Promise<string> {
  let nextToken: string | undefined;

  do {
    const response = await withRetry(
      () =>
        lexClient.send(
          new ListBuiltInIntentsCommand({
            localeId: BOT_LOCALE_ID,
            nextToken,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const intents = response.builtInIntentSummaries ?? [];
    for (const intent of intents) {
      const sig = intent.intentSignature ?? "";
      if (sig.toLowerCase().includes("qinconnect") || sig.toLowerCase().includes("qinconnectintent")) {
        return sig;
      }
    }

    nextToken = response.nextToken;
  } while (nextToken);

  throw new Error(
    `AMAZON.QinConnectIntent is not available in locale ${BOT_LOCALE_ID}. ` +
    `Ensure Amazon Connect AI Agents is enabled on your Connect instance and the region supports it.`
  );
}

/**
 * Find an existing bot by name. Returns the bot ID if found, null otherwise.
 */
async function findExistingBot(
  lexClient: LexModelsV2Client,
  botName: string,
  signal?: AbortSignal
): Promise<string | null> {
  let nextToken: string | undefined;

  do {
    const response = await withRetry(
      () =>
        lexClient.send(
          new ListBotsCommand({
            filters: [
              {
                name: "BotName",
                values: [botName],
                operator: "CO",
              },
            ],
            nextToken,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const bots = response.botSummaries ?? [];
    for (const bot of bots) {
      if (bot.botName === botName && bot.botId) {
        return bot.botId;
      }
    }

    nextToken = response.nextToken;
  } while (nextToken);

  return null;
}

/**
 * Find the contact flow ID for the test harness universal flow.
 */
async function findContactFlowId(
  connectClient: ConnectClient,
  instanceId: string,
  signal?: AbortSignal
): Promise<string | null> {
  const response = await withRetry(
    () =>
      connectClient.send(
        new ListContactFlowsCommand({
          InstanceId: instanceId,
          ContactFlowTypes: ["CONTACT_FLOW"],
        }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const flow = (response.ContactFlowSummaryList ?? []).find(
    (f) => f.Name === FLOW_NAME
  );

  return flow?.Id ?? null;
}

/**
 * Poll the bot status until it reaches "Available" (after creation).
 * Lex bots are in "Creating" state briefly after CreateBot returns.
 */
async function pollBotAvailable(
  lexClient: LexModelsV2Client,
  botId: string,
  signal?: AbortSignal
): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = 30_000; // 30 seconds should be plenty for bot creation

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Bot creation timed out after 30 seconds");
    }

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    await delay(2000);

    const describeResponse = await withRetry(
      () =>
        lexClient.send(
          new DescribeBotCommand({ botId }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const status = describeResponse.botStatus ?? "Unknown";

    if (status === "Available") {
      return;
    }

    if (status === "Failed") {
      throw new Error("Bot creation failed");
    }
  }
}

/**
 * Poll the bot locale status until it leaves "Creating" state.
 * After CreateBotLocale, the locale is briefly in "Creating" before becoming "NotBuilt".
 */
async function pollBotLocaleReady(
  lexClient: LexModelsV2Client,
  botId: string,
  signal?: AbortSignal
): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = 30_000;

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Bot locale creation timed out after 30 seconds");
    }

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    await delay(2000);

    const describeResponse = await withRetry(
      () =>
        lexClient.send(
          new DescribeBotLocaleCommand({
            botId,
            botVersion: "DRAFT",
            localeId: BOT_LOCALE_ID,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const status = describeResponse.botLocaleStatus ?? "Unknown";

    // "NotBuilt", "Built", or "ReadyExpressTesting" all mean locale is ready for operations
    if (status !== "Creating") {
      return;
    }
  }
}

/**
 * Resolve an existing bot alias by name. Used when CreateBotAlias conflicts.
 */
async function resolveExistingAlias(
  lexClient: LexModelsV2Client,
  botId: string,
  signal?: AbortSignal
): Promise<{ botAliasId: string }> {
  const response = await withRetry(
    () =>
      lexClient.send(
        new ListBotAliasesCommand({ botId }),
        { abortSignal: signal }
      ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const alias = (response.botAliasSummaries ?? []).find(
    (a) => a.botAliasName === ALIAS_NAME
  );

  if (!alias?.botAliasId) {
    throw new Error(`Alias "${ALIAS_NAME}" reported as existing but could not be found`);
  }

  return { botAliasId: alias.botAliasId };
}

/**
 * Poll the bot locale build status until it reaches "Built" or times out.
 */
async function pollBotLocaleBuild(
  lexClient: LexModelsV2Client,
  botId: string,
  signal?: AbortSignal
): Promise<void> {
  const buildStartTime = Date.now();

  while (true) {
    if (Date.now() - buildStartTime > BUILD_TIMEOUT_MS) {
      throw new BuildTimeoutError(
        "BuildBotLocale timed out after 120 seconds without reaching Built status"
      );
    }

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    await delay(BUILD_POLL_INTERVAL_MS);

    const describeResponse = await withRetry(
      () =>
        lexClient.send(
          new DescribeBotLocaleCommand({
            botId,
            botVersion: "DRAFT",
            localeId: BOT_LOCALE_ID,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    const status = describeResponse.botLocaleStatus ?? "Unknown";

    if (status === "Built") {
      return;
    }

    if (status === "Failed") {
      throw new Error(
        `BuildBotLocale failed: ${describeResponse.failureReasons?.join(", ") ?? "Unknown reason"}`
      );
    }
  }
}

/**
 * Provision or update the contact flow.
 * If the flow already exists, update its content. Otherwise, create it.
 */
async function provisionContactFlow(
  connectClient: ConnectClient,
  instanceId: string,
  botAliasArn: string,
  assistantArn: string,
  domainArn: string,
  signal?: AbortSignal
): Promise<string> {
  // Read analytics language from localStorage (default to "en-US")
  const analyticsLanguage = localStorage.getItem("analytics-language") || "en-US";

  // Load the flow template
  const { default: flowTemplate } = await import("./flow-template.json");
  const templateString = JSON.stringify(flowTemplate);
  const populatedContent = injectFlowTemplate(templateString, botAliasArn, assistantArn, domainArn, analyticsLanguage);

  // Log the populated flow content for debugging (development only)
  if (import.meta.env.DEV) {
    console.log("[TestHarness] Contact flow content:", populatedContent);
  }

  // Check if flow already exists
  const existingFlowId = await findContactFlowId(connectClient, instanceId, signal);

  if (existingFlowId) {
    // Update existing flow content
    await withRetry(
      () =>
        connectClient.send(
          new UpdateContactFlowContentCommand({
            InstanceId: instanceId,
            ContactFlowId: existingFlowId,
            Content: populatedContent,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );
    return existingFlowId;
  }

  // Create new flow
  try {
    const createResponse = await withRetry(
      () =>
        connectClient.send(
          new CreateContactFlowCommand({
            InstanceId: instanceId,
            Name: FLOW_NAME,
            Type: "CONTACT_FLOW",
            Content: populatedContent,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    return createResponse.ContactFlowId!;
  } catch (err: unknown) {
    console.error("[TestHarness] CreateContactFlow failed:", err);
    throw err;
  }
}

/**
 * Custom error class for build timeout.
 */
class BuildTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildTimeoutError";
  }
}
