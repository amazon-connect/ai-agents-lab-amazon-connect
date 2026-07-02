# Script Runner

The Script Runner executes a test script as a single automated conversation — one pass through all the turns, from start to finish, with per-turn latency metrics. It's the step between manual testing ("does this work?") and batch testing ("does this work reliably?").

## What a test script is

A test script is a YAML file that defines a multi-turn conversation as a series of customer utterances. When the runner plays it back, it sends each utterance to the agent in order and waits for a response before proceeding.

The simplest possible script:

```yaml
name: "Damaged item return"
turns:
  - customer: "I received a damaged item"
  - customer: "Order number is 12345"
  - customer: "Yes, I'd like a refund"
```

Each turn sends one customer message. The agent's response is captured but not validated — validation happens in Evaluation.

An optional `expectedResponses` field per turn tells the runner how many agent messages to wait for before sending the next customer utterance (useful if your agent sends multiple messages in sequence):

```yaml
turns:
  - customer: "Hello"
    expectedResponses: 2
```

See [Reference](./10-reference.md) for the full YAML specification.

## Loading a script

Navigate to **Testing**, select the **Chat** or **Voice** tab, then choose **Script** mode from the mode selector.

You can load a script two ways:

- **From file** — click the file upload button and select a `.yaml` or `.yml` file.
- **From a previous session** — if you exported a script in the same browser session, it may already be populated in the textarea.

The script content appears in the editable textarea. You can make changes directly before running.

## Running the script

1. Make sure the infrastructure status shows **Ready** (see [Infrastructure Setup](./05-infrastructure-setup.md)).
2. Select the AI agent you want to test.
3. Click **Run Script**.

The runner sends turns one at a time, waiting for the agent's response after each. The panel updates in real time showing:
- The current turn being sent
- Turn status (waiting / completed / failed)
- Per-turn response time

When all turns complete, the run shows a summary with total duration and per-turn latency.

## Reading results

After the run completes, each turn shows:

- **Status** — completed (green) or failed (red)
- **Latency** — time from sending the utterance to receiving the agent's final response for that turn

If a turn fails, the error message is shown inline. Common causes: network timeout, the agent returned an error, or the connection was dropped.

## Voice script runner

The Voice Script Runner works identically to the chat script runner, but sends audio instead of text. Before running:

- Select a **Customer voice** (Polly voice used to synthesize your utterances)
- Set the **Silence threshold** (seconds of silence after the agent responds before advancing to the next turn — see [Manual Testing](./04-manual-testing.md#voice-settings))

The app pre-synthesizes all customer utterances before the run starts, so audio is consistent across runs.
