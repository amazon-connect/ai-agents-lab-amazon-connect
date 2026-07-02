# Batch Testing

Batch testing runs your script many times in parallel to measure how reliably and quickly your agent performs. A single successful run tells you the agent works. Running it 100 times tells you it works consistently — and how fast.

## Setting up a batch run

Navigate to **Testing**, select **Chat** or **Voice**, then choose **Batch** mode.

You'll need:
- A script loaded in the textarea (see [Script Runner](./06-script-runner.md) for how to load one)
- Infrastructure in **Ready** state (see [Infrastructure Setup](./05-infrastructure-setup.md))

Configure the run:

- **Iteration count** — how many times to run the script.
- **Concurrency** — how many conversations run in parallel. Higher concurrency finishes faster but puts more load on your Connect instance and agent. Start with 3–5 and increase once you've confirmed it works.

## Running the batch

Click **Run Batch**. The results table appears immediately and populates as iterations complete. Each row shows:

- Iteration number
- Status: running (spinner), completed (green), failed (red)
- Duration

You can adjust the **concurrency** slider while the batch is running without stopping it — useful if you want to increase or decrease load mid-run.

To stop a batch early, click **Stop batch**. Iterations already in flight will complete; no new ones will start.

## Latency histogram

Toggle the **Chart** switch to show a histogram of iteration durations. Bucket sizes are chosen automatically based on the spread of your data.

Two key metrics are shown above the chart:
- **p50** — the median duration. Half of your iterations completed faster than this.
- **p95** — the 95th percentile. 95% of iterations completed faster than this. A high p95 relative to p50 suggests occasional slow outliers worth investigating.

Only successfully completed iterations are included in the chart.

## Drilling into an iteration

Click any row in the results table to open the detail panel, which shows the full **Conversation transcript** for that iteration — every customer message and agent response, with per-message timestamps.

This is useful for investigating failed iterations or spot-checking agent responses across runs.

## Generating utterance variations

If your script always sends the exact same customer utterances, your batch is testing one specific phrasing — not the natural variation of how real customers express themselves. The **Generate variations** feature addresses this.

Click **Generate variations** (available in Batch mode when a script is loaded). A panel opens:

- **Variation count** — how many alternative phrasings to generate per turn (e.g. 3 means the original + 3 alternatives = 4 options per turn).
- **Temperature** — controls phrasing diversity. 0.0 is conservative and predictable; 1.0 is more creative and varied. A value of 0.5–0.7 works well for most scripts.

Click **Generate**. The app generates paraphrases for each customer turn with full conversational context, so the alternatives are coherent relative to the rest of the conversation.

When generation completes, the script textarea updates to show the enriched YAML — you can inspect and edit the generated alternatives before running. The batch will then randomly pick one utterance per turn per iteration from the pool of original + variations.

You can export the enriched script for reuse in future sessions.

> **Variation generation requires the Bedrock model configured in Settings → Variation generation model.** The default is Claude Haiku with the cross-region inference prefix for your region.

## Exporting batch results

Once the batch is complete, click **Export Results**. This downloads a JSON file containing:
- Script name and run metadata
- All completed iterations with their contact IDs and durations

**Save this file.** It is the direct input to [Evaluation](./08-evaluation.md) — you'll upload it there to score the agent's conversations against an evaluation form.

## Voice batch testing

Voice batch works the same way as chat batch with two differences:

1. **Audio pre-synthesis** — all customer utterances are synthesized with Amazon Polly once before the batch starts. This keeps synthesis cost fixed regardless of iteration count and ensures audio is consistent across all iterations.
2. **Silence threshold** — the system waits this many seconds of silence after the agent speaks before sending the next utterance. Set this in the voice settings panel before running (see [Manual Testing → Voice settings](./04-manual-testing.md#voice-settings)).

Voice batches can run at lower concurrency than chat because each iteration holds a live WebRTC connection. Start with 2–3 concurrent iterations for voice.
