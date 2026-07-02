# Infrastructure Setup

Before you can use automated testing (Script Runner, Batch, or Voice), the app needs to provision supporting infrastructure in your AWS account. This is a one-time step per Connect instance.

## What gets provisioned

The setup creates two AWS resources scoped to the selected Connect instance:

1. **A Lex V2 bot** — created in your AWS account, named `connect-test-harness-<first 8 chars of instance ID>`. This bot acts as the entry point that routes test contacts into the AI agent you're testing. It is tagged with the instance ID for later detection, and associated with the selected Connect instance.

2. **A contact flow** — created inside the selected Connect instance, named `test-harness-universal-flow`. This flow receives incoming test contacts and directs them through the Lex bot to your selected AI agent. It is also where the Contact Lens language setting is injected (see [Settings](./09-settings.md)).

> **Each Connect instance requires its own setup.** If you work with multiple Connect instances in the same account, you will need to run setup once per instance. The Lex bot is named using the first 8 characters of the instance ID, so each instance gets a distinct bot.

These resources are created in the same AWS account and region as your Connect instance, using the credentials you selected at sign-in.

## When setup is needed

The Testing page checks for existing infrastructure automatically when it loads. The **status button** in the top-right corner of the Testing page shows one of:

| Status | Meaning |
|--------|---------|
| **Setup Required** | No infrastructure found — setup has not been run yet for this instance. |
| **Ready** | Infrastructure detected and ready to use. |
| **Error** | Infrastructure was found but something is wrong. |

If the status is **Ready**, you can skip the rest of this section.

## Running setup

1. Click the **Setup Required** status button. A modal opens.
2. Click **Start Setup**. The app begins provisioning resources and shows a progress bar with the current step:
   - Creating bot
   - Creating locale
   - Creating intent
   - Building locale
   - Creating version
   - Creating alias
   - Tagging bot
   - Associating with Connect
   - Creating contact flow
3. Setup typically takes 1–2 minutes.
4. When setup completes, the progress bar shows **Setup complete**. Click **Close**.

The status button will now show **Ready**.

## If setup fails

If a step fails, an error message appears with a **Retry** button. Click it to resume from the failed step — you don't need to start over. Common causes:

- **Permission error** — your IAM role is missing a required permission (e.g. `lex:CreateBot`, `connect:AssociateBot`). Check the [Permissions](./09-settings.md#permissions) page to identify what's missing.
- **Timeout** — a transient AWS API issue. Retry usually resolves it.

## Viewing infrastructure details

Once setup is complete, you can click the **Ready** status button at any time to see the bot name, bot alias ARN, and contact flow ID that were provisioned. This is useful for troubleshooting or if an AWS administrator needs to locate the resources.

## Re-running setup

If you change the **Contact Lens language** setting (in Settings), you need to re-provision the contact flow for the new language to take effect. Click the **Ready** button and then **Start Setup** — setup is idempotent and will update the existing resources rather than creating duplicates.

## Infrastructure and costs

The Lex bot and contact flow are standard AWS resources. Lex charges per request (you are only billed when running tests, not for having the bot exist). The contact flow has no standing cost. Resources can be deleted from the AWS console if you no longer need them.
