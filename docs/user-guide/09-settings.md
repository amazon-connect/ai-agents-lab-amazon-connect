# Settings

The Settings section has three pages, accessible from the sidebar under **Settings**.

## General settings

**Settings → General**

### Contact Lens language

The BCP-47 language code used by Contact Lens for speech-to-text transcription when processing your test contacts.

This value is injected into the test harness contact flow when setup runs. It determines the language model Contact Lens applies for transcript generation (which you'll later use in Evaluation).

Common values:

| Code | Language |
|------|----------|
| `en-US` | US English (default) |
| `en-AU` | Australian English |
| `en-GB` | British English |
| `fr-FR` | French |
| `de-DE` | German |
| `es-US` | US Spanish |

> **If you change this setting, you must re-provision the test harness contact flow** for the change to take effect. Go to the Testing page and click the status button to trigger re-provisioning. Existing transcripts already in Contact Lens are not affected.

### Variation generation model

The Amazon Bedrock model used to generate utterance paraphrases when you click **Generate variations** in the batch testing panel.

The default is Claude Haiku. You can change this to any model available in your account and region. The model ID must include the cross-region inference prefix appropriate for your region:

- `us.` for US regions (e.g. `us.anthropic.claude-haiku-4-5-20251001-v1:0`)
- `eu.` for European regions
- `ap.` for Asia Pacific regions

Changes take effect on the next variation generation run. Leave the field empty to use the default.

## Evaluation settings

**Settings → Evaluation**

### Evaluation model ID

The Amazon Bedrock model used to generate evaluation forms when you click **⋮ → Create evaluation form** on the Testing page. This model analyses your conversation and produces the structured form JSON.

The default is Claude Haiku, which works well for most scenarios. For more complex conversations or if you want more nuanced section and question generation, you can switch to a larger model such as Claude Sonnet. Leave the field empty to use the default. Click **Save** after making changes.

> **Note:** Scoring of contacts during evaluation is handled by Connect's native gen-AI evaluation capability, not by this model. This setting only affects form generation.

## Permissions

**Settings → Permissions**

The Permissions page verifies that your current IAM role has all the AWS permissions required by the tool, scoped to your selected Connect instance.

### Reading the results

Permissions are grouped by feature area (e.g. Workspace Discovery, Testing — Chat, Evaluations). Each group shows an overall status:

- **All granted** — every permission in this group is available
- **Partially granted** — some permissions are missing; the feature will work partially
- **Not granted** — required permissions are missing; the feature will not work

Click **Permission details** on any group to expand the full list and see exactly which actions are allowed or denied.

### When to use this

- When you first set up the tool and want to confirm your role has the right permissions
- When a feature isn't working as expected — the permissions page will quickly tell you if access is the issue
- When you've been assigned a new role and want to verify it before starting a session

> The check evaluates IAM policies without making real API calls. Resource-based policies and service control policies may not be fully reflected, but the check covers the vast majority of common permission issues.
