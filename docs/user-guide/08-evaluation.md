# Evaluation

Evaluation answers the question batch testing cannot: **did the agent actually do the right thing?**

Batch testing tells you conversations completed and how fast. It doesn't tell you whether the agent verified the customer's identity before issuing a refund, confirmed the correct details, or skipped a step it should have taken. Evaluation measures this — using Amazon Connect's built-in gen-AI evaluation capability to score each contact from your batch against criteria you define.

## Before you start

You need two things:

1. **An evaluation form** — a structured set of questions that defines what good agent behaviour looks like for your scenario. You create this from the Testing page after a successful manual conversation. See [Creating an evaluation form](#creating-an-evaluation-form) below, or [Manual Testing → Create evaluation form](./04-manual-testing.md#create-evaluation-form).

2. **Batch results (JSON)** — exported after a batch test run. Contains the contact IDs for every completed iteration. See [Batch Testing → Exporting results](./07-batch-testing.md#exporting-batch-results).

Both should represent the same scenario — the batch was run using the script derived from the same conversation you used to create the form.

> **Contact Lens must be enabled** on your Connect instance, and post-contact analysis must be configured. Evaluation requires the Contact Lens transcript for each contact. If a contact's transcript isn't available yet when you import your results, the tool will wait and retry automatically.

---

## Creating an evaluation form

Evaluation forms are created from the Testing page, directly from a chat conversation where the agent behaved correctly. This is your ground truth.

1. Have a representative conversation in **Manual** chat mode — one where the agent handles the scenario well end to end.
2. Click **⋮ → Create evaluation form** from the actions menu.
3. The tool sends the conversation to Amazon Bedrock, which analyses it and generates a structured form — sections covering what the agent needed to accomplish, and questions about how it communicated.
4. The generated form appears in a code editor for review. Read through it: check that the sections and questions reflect what matters for your scenario, and that the question instructions clearly describe what correct behaviour looks like.
5. Edit directly in the editor if anything needs adjusting — you can add, remove, or rephrase questions.
6. Click **Deploy**. The form is created and activated in your Connect instance, ready to use.

Forms are tagged automatically so they appear in the evaluation form selector. If you want to create forms manually in the Connect console instead, add the tag `created-by: ai-agents-lab` so they show up in the list.

> **How the form is structured:** Each question asks something observable about the conversation — "Did the agent verify the customer's identity?", "Did the agent provide the correct information?", "Did the agent resolve the issue clearly?" — and comes with detailed instructions that Connect's gen-AI uses to answer it. Questions are grouped into sections (typically Goals and Style), each weighted appropriately.

---

## Running an evaluation

### Step 1 — Import batch results

Navigate to **Evaluations** from the sidebar.

Drag and drop your batch results JSON file onto the drop zone, or click it to browse. The tool shows the script name and the number of contacts found. If anything looks wrong, click **Replace** to swap the file.

Transcript loading (hydration) starts automatically. The tool fetches the Contact Lens post-call transcript for each contact from your batch. This is what the evaluation will be scored against.

### Step 2 — Watch hydration

The **Contacts** tab shows the status for each contact:

| Status | Meaning |
|--------|---------|
| **Pending** | Waiting to be fetched |
| **Loading** | Fetch in progress |
| **Awaiting analysis** | Contact Lens hasn't finished processing this contact's transcript yet — the tool will keep retrying |
| **Ready** | Transcript loaded, ready to evaluate |
| **Failed** | Transcript could not be fetched after all retries |

If a contact shows **Failed**, click **Retry** to try again. If transcripts are taking a while to appear (common if you're evaluating contacts from a very recent batch run), the **Awaiting analysis** state will resolve on its own — no need to reload the page.

### Step 3 — Select evaluation forms

While hydration runs, the **Evaluation forms** section shows the forms available from your Connect instance. Select one or more forms to evaluate against. You can run multiple forms in a single pass — each contact will be scored against every selected form.

### Step 4 — Evaluate

Once all contacts are **Ready** and at least one form is selected, the **Evaluate all** button becomes available.

Click it. The tool:

1. **Submits evaluations** — sends each contact to Connect for scoring against each selected form. Connect's gen-AI reads the Contact Lens transcript and answers each question on the form. Submissions are rate-controlled to avoid throttling.

2. **Waits for results** — polls Connect for results as they come in. Each contact takes 2–5 minutes. The progress panel shows how many have been submitted and how many have completed.

3. **Shows results** — as evaluations complete, scores appear in the Contacts table. When all are done, the aggregate summary appears.

You can cancel at any time. Results collected so far are preserved.

---

## Reading the results

### Aggregate summary

Once evaluation completes, a summary section shows key metrics. If you ran multiple forms, you see one panel per form plus a combined view.

For each form:
- **Pass rate** — the percentage of contacts that passed overall
- **Average score** — the mean score across all evaluated contacts (0–100)
- **Score distribution** — how contacts are spread across four bands (0–25, 26–50, 51–75, 76–100)
- **Per-question pass rates** — for each question in the form, the percentage of contacts where the agent answered correctly

The per-question breakdown is the most actionable part. A question with a significantly lower pass rate than the others points to something the agent consistently gets wrong — a step it skips, information it doesn't communicate, or a pattern it mishandles.

### Drilling into a contact

Click any row in the Contacts table to open the detail panel.

If you ran multiple forms, tabs let you switch between them. For each form, you'll see:

**Overall score and verdict** — the percentage score and whether it passed (≥90%), came in partially (50–89%), or failed (<50%).

**Summary** — a short paragraph from the evaluator describing how the contact went overall.

**Per-question results** — each question from the form with:
- The answer the evaluator gave (Yes / No / N/A)
- The score for that question
- The **justification** — a short explanation of why the evaluator answered that way, with references to specific parts of the conversation

The justification is particularly useful for understanding failures: it tells you exactly what the agent said (or didn't say) that led to the score.

**Transcript** — the full Contact Lens transcript for this contact, showing the actual customer and agent messages in order.

---

## Re-running evaluation

If you want to re-score contacts — for example after reviewing the results and adjusting your forms in Connect — click **Re-run evaluation**. This rescores all contacts from scratch using the current form versions.

## Starting over

Click **New import** to discard the current evaluation and start fresh with a new batch results file.

---

## Tips

- **Run evaluation on a small batch first** — 10–20 contacts is enough to see if your form's questions are capturing what you care about. Adjust the form if needed before running a larger evaluation.
- **Use the per-question pass rates to prioritise** — if one question consistently fails, that's where your agent needs work. If everything passes, consider whether your questions are specific enough.
- **Check the justifications on failed contacts** — the evaluator's reasoning often points to a specific utterance or gap in the agent's response that you can trace back to the span waterfall.
- **Multiple forms are useful for cross-cutting concerns** — for example, one form for "did the agent achieve the goal?" and another for "did the agent communicate clearly?" gives you separate pass rates for outcome quality vs. interaction quality.
