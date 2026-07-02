# How Do You Know Your AI Agent Is Actually Good? Introducing AI Agents Lab for Amazon Connect

Amazon Connect has made it remarkably straightforward to deploy AI-powered agents that handle customer interactions end-to-end. With Connect AI Agents, you can configure agents that reason over customer utterances, invoke tools, and resolve issues autonomously — all within the familiar Connect environment.

But once those agents are live, we hear the same questions from customers, in roughly this order:

1. "How do we know they'll keep working correctly after we make changes?"
2. "How do we know the *quality* of what they're doing?"

These aren't questions about technology. They're questions about confidence. Confidence to deploy. Confidence to change. Confidence to scale.

We built **AI Agents Lab for Amazon Connect** to answer both — and in this post we'll walk through why each matters, and how the tool addresses it.

---

## The underlying problem: the feedback loop is too slow

When an AI agent misbehaves — misroutes a customer, calls the wrong tool, or produces an unhelpful response — diagnosing and fixing it requires a cycle that's too slow. You need to reproduce the problem reliably, make a change, verify it didn't break anything else, and ship with confidence.

Today, most teams do this manually: someone has a bad interaction, it gets escalated, an engineer digs into logs, a prompt change is made, it gets tested informally against a few cases, and deployed with fingers crossed.

AI Agents Lab for Amazon Connect replaces that cycle with something repeatable and measurable.

---

## Observability: the entry point

Before you can test or evaluate, you need to understand what your agent is actually doing. Connect records rich execution traces for every AI agent interaction — every LLM inference call, every tool invocation, token usage, timing, the full message history, and the complete system prompt. AI Agents Lab for Amazon Connect visualises this data as a waterfall timeline, filtering by agent where multiple agents are involved in a single contact.

This gives teams the context they need before they start testing: what does a good interaction look like? What does a bad one look like? Where is time actually being spent?

---

## Testing: verifying behaviour at scale

### Start from a real conversation

The fastest way to build a test is to have a conversation. The app's manual chat and voice testing modes let you interact directly with any agent — over real WebRTC for voice, using the same audio path your customers use. When you've had an interaction worth preserving, one click converts it to a YAML test script:

```yaml
name: "Damaged item return flow"
turns:
  - customer: "I received a damaged item"
  - customer: "Order number is 12345"
  - customer: "Yes, I'd like a refund"
```

Your test library grows from real usage. No separate scripting tool, no synthetic data.

### Batch runs: from one conversation to hundreds

Running a script once tells you it works. Running it 100 times tells you it works *reliably* — and how fast.

Set an iteration count and a concurrency level, start the batch, and watch it run in real time. Results show per-iteration status, durations, and aggregate latency stats (average, p50, p95). Drill into any iteration to read the full conversation transcript. Adjust concurrency live while the batch runs. Export results as JSON when you're done.

Voice batches work the same way. Amazon Polly pre-generates customer audio once before the batch starts — so you're not paying synthesis overhead per call, and the audio is consistent across all iterations.

The result: you can run a meaningful regression suite for your agent in minutes, not days. And the JSON export is the direct input to evaluation.

---

## Evaluation: knowing whether responses were actually good

This is the question most teams haven't been able to answer at scale: not "did the conversation complete?" but "was what the agent said actually correct?"

Speed and completion rate matter. But an agent that responds in 500ms with confident-sounding nonsense is worse than one that takes 2 seconds and gives the right answer. Batch testing alone can't tell you which you have.

### Step one: define what good looks like

Evaluation is built around **Amazon Connect's native evaluation capability** — the same structured evaluation feature Connect offers for human agent quality management, now applied to AI agents.

The first step is creating an evaluation form that captures the observable milestones for your scenario: did the agent verify the customer's identity, communicate the right information, resolve the issue through the correct steps? These forms are structured question sets, each with criteria Connect's gen-AI uses to score the contact.

Writing evaluation forms from scratch is time-consuming, and getting the questions right isn't obvious. AI Agents Lab generates them automatically: have a representative manual chat conversation where the agent handles the scenario correctly, then click **⋮ → Create evaluation form**. Amazon Bedrock analyses the conversation and produces a structured form — sections covering what the agent needed to accomplish, questions about how it communicated, with detailed scoring instructions. Review and edit in the inline code editor, then click **Deploy** to create and activate the form directly in your Connect instance.

This is your ground truth. You only need to do it once per scenario.

### Step two: score a batch

Import the JSON export from your batch run into the Evaluations page. The tool automatically fetches the Contact Lens post-call transcript for each contact. Select one or more evaluation forms, click **Evaluate all**, and Connect's gen-AI evaluator reads each transcript and answers every question on the form.

For each contact you get:
- An overall **score** (0–100) and **verdict** (pass ≥90% / partial 50–89% / fail <50%)
- Per-question results — the answer (Yes / No / N/A), score, and a written **justification** explaining exactly what the agent said (or didn't say) that determined the score

The justification is where the real value is. It points you directly to the utterance or gap that caused a failure — something you can immediately trace back to the span waterfall to understand what the agent was doing internally.

### What this enables

**Prompt regression testing.** Change your system prompt, re-run the batch, compare scores before and after. Catch the cases where a change improved one scenario but quietly degraded another.

**Multiple forms in a single pass.** Run one form for "did the agent achieve the goal?" and another for "did the agent communicate clearly?" — separate pass rates for outcome quality and interaction quality, from the same batch run.

**A baseline you can defend.** Establish an evaluation score for your current agent configuration. Every subsequent change either holds the baseline or doesn't — and you'll know before it reaches production.

### The result: a closed loop

1. Something looks wrong in production → **Observability** shows you what happened in that specific contact
2. You identify the failure mode → **Testing** lets you reproduce it reliably at scale
3. You fix it → **Evaluation** tells you whether the fix actually improved quality across the full scenario set

This loop used to take days. With AI Agents Lab for Amazon Connect, it can happen in a single afternoon.

---

## How it's built

The app runs entirely in the browser — no backend server, no database. It authenticates via IAM Identity Center's OIDC flow, obtains temporary AWS credentials, and calls AWS APIs directly with SigV4 signing. Credentials auto-refresh before expiry. A built-in permissions checker verifies all required IAM actions for the current role against the selected Connect instance.

Deployment is a single CDK stack:

```bash
./scripts/deploy.sh all -c identityCenterStartUrl=https://d-XXXXXXXXXX.awsapps.com/start
```

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 6 |
| UI | Cloudscape Design System |
| Auth | IAM Identity Center OIDC + PKCE |
| Voice | Amazon Chime SDK (WebRTC) + Amazon Polly |
| Evaluation scoring | Amazon Connect (native gen-AI evaluation) |
| Form generation | Amazon Bedrock (configurable model) |
| Infrastructure | AWS CDK v2 |

---

## What's next

**Prompt improvement recommendations.** Evaluation tells you *where* your agent is falling short. The natural next step is closing the loop automatically: take the set of failed and partial contacts — their scores, their per-question justifications, and the actual transcripts — and feed them to a model to identify patterns across failures and suggest specific changes to the system prompt. Rather than manually reading through dozens of justifications to understand what's going wrong, you'd get a synthesised recommendation: "the agent consistently fails to mention the 30-day return window — consider adding this constraint explicitly to the system prompt." Evaluation becomes not just a measurement tool but a continuous improvement engine.

---

AI Agents Lab for Amazon Connect is open source. Clone it, run the deploy script with your Identity Center start URL, and you'll have testing and evaluation running against your Connect instance in minutes.

The feedback loop for your AI agents doesn't have to be slow. It just has to be set up once.
