# Getting Started

## Signing in

When you open the application, you'll see a **Sign in required** screen with a single "Sign in with SSO" button. Click it — you'll be redirected to your organisation's AWS IAM Identity Center login page. After authenticating, you'll be returned to the app automatically.

Your session persists until you close the browser tab or sign out. If your session expires, you'll be returned to the sign-in screen.

> **Sign out** is available from the user menu in the top-right corner of the navigation bar.

## Selecting your AWS account and role

After signing in, you'll land on a credential setup screen before you can access anything else. This is where you tell the app which AWS account and IAM role to use for all API calls.

1. **Select an AWS account** — the list shows all accounts accessible to your Identity Center user. Pick the account that contains your Connect instance.
2. **Select an IAM role** — the list updates to show the permission sets available for that account. Select the role that has the necessary Connect and Bedrock permissions.

The app will then obtain temporary AWS credentials for that role.

> If you're unsure which role to use, check with your AWS administrator. You can also verify your permissions at any time via **Settings → Permissions**.

## Selecting a Connect instance and AI agent

Once credentials are set, you'll see two dropdown selectors at the top of the page:

1. **Select instance** — choose the Amazon Connect instance you want to work with.
2. **Select assistant** — choose the Connect AI Agents assistant associated with that instance.

After both are selected, the navigation becomes available and you can start using the tool.

> These selections persist for your session. If you work with multiple instances, you can change either selector at any time — the rest of the app will update accordingly.

## Understanding the navigation

The left-hand sidebar contains the main sections:

| Section | What it's for |
|---------|---------------|
| **Contacts** | Browse real customer contacts and inspect span waterfalls |
| **Testing** | Manual and automated agent testing (chat + voice) |
| **Evaluations** | Score batch test results against a reference conversation |
| **Settings** | Configure Contact Lens language, Bedrock models, and check permissions |

The top navigation bar shows the app name on the left and your signed-in user and sign-out option on the right.
