# Span Waterfall

The Contacts section lets you browse real customer contacts and inspect the detailed execution trace for any AI agent interaction. This is useful for understanding what your agent is actually doing — which model it called, with what prompt, what tools it used, and where time was spent.

## Browsing contacts

Navigate to **Contacts** from the sidebar. The page shows a table of recent contacts from your Connect instance.

By default, it shows contacts from the last 24 hours. To change the time range, click the date range selector and choose a preset (Last 7 days, Last 30 days, etc.) or set a custom range, then click **Apply**. The table will reload.

Each row shows the contact ID, channel (chat or voice), start time, and duration. Click any row to open the span waterfall for that contact.

### Filtering by agent

If you have many contacts, you can narrow the list to contacts handled by a specific AI agent using the agent filter above the table.

### Going directly to a contact

If you know the contact ID, paste it into the **Go to contact by ID** field at the bottom of the page and click **Go** (or press Enter). This is the fastest way to navigate to a specific contact, for example when investigating a support ticket.

## Reading the span waterfall

After selecting a contact, the page switches to the span waterfall view. This is a timeline showing all the execution steps for that contact, from left (start) to right (end).

Each horizontal bar is one **span** — a unit of work the agent performed. There are three span types:

| Span type | What it represents |
|-----------|-------------------|
| **Invoke Agent** | The top-level agent invocation — one per customer turn. Contains all the inference and tool calls for that turn. |
| **Inference** | A single LLM call to Amazon Bedrock. Shows the model, duration, and token usage. |
| **Execute Tool** | A tool invocation — the agent called an action (e.g. looked up an order, sent a message). |

Spans are nested: Inference and Execute Tool spans appear as children under the Invoke Agent span that triggered them.

### Filtering by agent

If the contact involved multiple AI agents, a **Filter by agent** dropdown appears above the waterfall. All agents are shown by default. Click the dropdown and deselect agents to focus on a single agent's spans.

### Inspecting a span

Click any span bar to open the detail panel on the right. The detail panel shows different information depending on the span type:

**Invoke Agent span:**
- Agent name, ID, version, and type
- Connect instance ARN and contact ID
- Total duration

**Inference span:**
- Model ID (e.g. `anthropic.claude-3-haiku...`)
- Time to first token
- Temperature, max tokens, finish reason
- Token usage (input, output, total, cache read/write)
- Prompt metadata (name, version, ARN) if a managed prompt was used
- Full system prompt
- Full message history (the conversation as the model saw it)

**Execute Tool span:**
- Tool name
- Duration
- Input and output payload

> The system prompt and message history in the Inference detail panel are exactly what the agent received — no summarisation or transformation.

### Zooming and scrolling

For contacts with many spans, use the zoom controls above the waterfall to expand the timeline horizontally. Scroll horizontally to navigate across long traces.
