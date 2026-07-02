# Manual Testing

The Testing page lets you have real conversations with your AI agents — by typing (chat) or speaking (voice). Manual testing is useful for:

- Exploring how an agent handles a particular scenario before automating it
- Producing a test script from a real conversation
- Generating an evaluation form from a successful interaction
- Spot-checking agent behaviour after a change

Navigate to **Testing** from the sidebar. The page has two tabs at the top: **Chat** and **Voice**.

> Before you can test, the page needs to detect (or provision) supporting infrastructure — a Lex bot and contact flow in your account. See [Infrastructure Setup](./05-infrastructure-setup.md). The status button in the top-right of the Testing page shows the current state.

## Selecting an agent

At the top of both the Chat and Voice tabs, there is an **AI Agent** selector. Click it to see the list of customer-facing agents configured for your Connect instance and assistant. Select the agent you want to test.

## Chat — Manual testing

In the mode selector, choose **Manual** to enable the chat input.

### Having a conversation

1. Type your message in the input field at the bottom of the chat panel.
2. Press Enter or click **Send**.
3. The agent's response appears in the panel. Wait for it to complete before sending the next message.

You can start a new conversation at any time by clicking **New conversation** in the actions menu (the "⋮" button at the top right of the chat panel). This clears the current transcript.

### Exporting the conversation

Once you've had a conversation worth preserving, the actions menu ("⋮" button) offers two export options. These are the bridge between manual testing and everything else in the tool.

#### Save as Script

Exports the conversation as a YAML test script. This script can be loaded into the Script Runner or Batch tester to replay the same conversation automatically.

1. Click **⋮ → Save as Script**.
2. Enter a name for the script (e.g. `damaged-item-return`).
3. Click **Save** — the file downloads as `<name>.yaml`.

The script preserves your customer utterances in order. The agent responses are not saved — when the script is replayed, the agent generates fresh responses each time.

#### Create evaluation form

Generates a structured Amazon Connect evaluation form from the conversation. This form can then be used to automatically score future batch test runs against the milestones established in this conversation.

> **This is an important step if you intend to run evaluations.** Do this after a conversation where the agent behaved correctly. The generated form captures the key milestones and observable outcomes from the interaction.

1. Click **⋮ → Create evaluation form**.
2. The chat panel switches to the **Evaluation Form** tab and shows a spinner while the form is generated.
3. An LLM (Amazon Bedrock) analyses the conversation and produces a structured form with sections and questions focused on observable conversation milestones.
4. Review the generated JSON in the code editor. The status bar shows whether the form is valid.
5. Optionally refine the form using the text input at the bottom — type a natural language instruction (e.g., "add a question about identity verification") and press **Send**. You can refine multiple times.
6. When satisfied, click **Deploy**. A confirmation modal shows the form summary and progress as it creates and activates the form in your Connect instance.

You can switch back to the **Conversation** tab at any time to reference the original chat while editing the form.

The evaluation form is designed for Connect's automated evaluation (gen-AI scoring). Questions focus on what's observable in the conversation transcript — information exchanged, steps completed, outcomes reached — not internal system compliance.

## Voice — Manual testing

The Voice tab lets you test agents over a real WebRTC audio connection — the same path a customer calling in would use. This is important for catching issues that don't appear in chat: speech recognition accuracy, audio latency, how the agent handles silence or hesitation.

### Voice settings

Before starting a call, review the voice settings panel (visible in Script and Batch modes — in Manual mode, your microphone is used directly):

- **Customer voice** — the Amazon Polly voice used to synthesize your utterances when running scripts or batch tests. This setting has no effect in Manual mode, where your real microphone is used.
- **Silence threshold** — the number of seconds of silence the system waits after the agent finishes speaking before advancing to the next scripted turn. Default is 2 seconds.

  This setting matters most in automated (Script/Batch) mode. Set it too low and the agent gets cut off mid-sentence if it pauses. Set it too high and tests run slowly. A good starting point: 2–3s for agents with short, direct responses; 4–6s for agents that produce multi-part answers or think longer.

  If your automated tests show unexpected failures or truncated responses, try increasing the threshold. If tests are running slowly with long silences between turns, try decreasing it.

### Having a voice conversation

1. Select the **Voice** tab and choose **Manual** mode.
2. Click **Start call**. Allow microphone access if prompted.
3. Wait for the call to connect. The status indicator shows when you're connected.
4. Press and hold **Push to Talk (PTT)** to speak, release to let the agent process your utterance.
5. Click **End call** when you're done.

Voice conversations do not support the "Create evaluation form" action — that feature is only available for chat. If you want to produce an evaluation form, have the same conversation in the Chat tab first.

## When to use chat vs voice

Use **chat** when you want to:
- Quickly explore agent behaviour
- Produce a test script or evaluation form
- Test agents that are primarily used in chat channels

Use **voice** when you want to:
- Test agents deployed on voice channels
- Verify that speech recognition handles your expected utterances correctly
- Check for latency or audio quality issues that only appear over WebRTC
