# Module 8 — Human-in-the-Loop
Source lessons:
- Structured Questions — https://vercel.com/academy/build-ai-agent-harness/structured-questions
- Approval Config — https://vercel.com/academy/build-ai-agent-harness/approval-config

## Structured Questions
**Core idea:** Agents default to guessing instead of asking — a tool alone doesn't fix that. You need an `askUser` tool (question + 2-4 options) *and* an explicit system-prompt protocol ("search first, ask second, act third") that scripts when to use it.

**Key points:**
- Models trained on chat data have absorbed "let me just figure this out for you" energy; asking "feels weak" to them, so they'd rather guess than call a question tool that exists.
- The fix has two parts: the tool (small) and the system prompt (does most of the work).
- `askUser` schema: `question: string`, `options: z.array(z.string()).min(2).max(4)`.
- The tool's `execute` does **not** actually block/wait — it just formats the options as a numbered list, logs them, and returns a string like `Asked: "..."\nOptions:\n...\n\n(Awaiting user response.)`. The real pause/resume is a harness-level concern (see the Note below).
- System prompt needs a dedicated `# Handling Ambiguity` section with a numbered protocol: 1) search for context, 2) `askUser` — do NOT guess, 3) act. Two worked examples are enough to anchor the pattern ("add auth" → ask OAuth vs JWT; "set up a db" → ask Postgres vs SQLite).
- Specific prompts (file paths, line numbers, precise instructions) should skip `askUser` and act directly — that distinction has to be stated explicitly or the agent over-triggers the tool.
- **Real architectural friction:** if `bash` (or any exploration tool) is blocked by an approval gate, the agent can't gather the context it needs to reach step 2, and may never ask a useful question. Approval gates and the ask-first protocol can work against each other.
- Watching the agent read 3-4 files before calling `askUser` is *expected* behavior (step 1 of the protocol), not a stall.

**Code patterns:**
```ts
// src/tools.ts
export function createAskUserTool() {
  return tool({
    description: `Ask the user a multiple-choice question.
WHEN TO USE: scoping ambiguous tasks, choosing between approaches,
  resolving a missing detail before acting.
WHEN NOT TO USE: you already have enough context to proceed.
DO NOT USE FOR: rhetorical questions or progress updates.`,
    inputSchema: z.object({
      question: z.string().describe("The question to ask the user"),
      options: z.array(z.string()).min(2).max(4)
        .describe("Two to four options for the user to pick from"),
    }),
    execute: async ({ question, options }) => {
      const formatted = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      console.log(`\nQuestion: ${question}\n${formatted}\n`);
      return `Asked: "${question}"\nOptions:\n${formatted}\n\n(Awaiting user response.)`;
    },
  });
}
```
```ts
// system prompt addition
sections.push(`
# Handling Ambiguity
When the task is ambiguous or has multiple valid approaches:
1. Search the code or docs to gather context first
2. Use askUser to let the user choose. Do NOT guess.
3. Examples: "add auth" -> ask OAuth or JWT; "set up a db" -> ask Postgres or SQLite

Specific tasks (with file paths, line numbers, or precise instructions) do not
need askUser. Act directly.`);
```
Uses the plain `tool()` helper from `ai` with a Zod `inputSchema` — standard AI SDK v7 tool-definition shape, nothing version-exotic here.

**Applies to numa:**
- numa already has this exact pattern one level further: `ask_player` is a tool **without** `execute` — the Trigger.dev run genuinely suspends until the player answers, which is the "real" version of what this lesson's `askUser` only sketches (its Note explicitly calls out that a real harness would pause and resume — numa already solved that with Trigger.dev's human-in-the-loop primitive).
- The "search first, ask second, act third" protocol and the 2-4 option constraint are worth auditing against numa's current `ask_player` prompt rules, especially since the team "just fixed it over-triggering" — this lesson's explicit ambiguous-vs-specific examples and numbered protocol are a concrete template for tightening that instruction.
- The approval-gate-vs-asking tension doesn't apply directly (numa's tools don't have an interactive bash approval gate), but the general lesson — a blocked exploration path can prevent the agent from ever reaching a useful question — is relevant if/when a verify step or sandboxed action requires gating.

## Approval Config
**Core idea:** Two distinct, complementary models for safety: a **config** layer (`{mode: "interactive" | "background" | "delegated"}`) set once per session that answers "who decides," and an **event** layer (`harness.on("tool_call", ...)`) that fires per call and answers "what policies apply," which can block or rewrite tool input regardless of mode.

**Key points:**
- Config model (already built earlier in the course as a discriminated union):
  ```ts
  type ApprovalConfig =
    | { mode: "interactive" }
    | { mode: "background" }
    | { mode: "delegated"; trust: string[] };
  ```
  Set at startup, doesn't change mid-session.
- Event model fires on every tool call; a handler returns `{ block: true, reason }` to stop it, or mutates `event.input` to rewrite it (e.g. wrap a bash command in `sandbox-exec -p '(deny default)' ...`), or passes through.
- Decision table from the lesson:
  | Use case | Config | Events |
  |---|---|---|
  | CI run, auto-approve everything | `mode: "background"` | Overkill |
  | Subagent inheriting trust from parent | `mode: "delegated"` | Wrong level |
  | Block writes to specific files | Too coarse | File-level policy |
  | Wrap commands in OS-level sandbox | Can't modify input | Input modification |
  | Project-specific safety rules | Global only | Per-project extension |
- Rationale for keeping them separate: operational mode is set by *who is running the harness* (CI, a developer, a delegated subagent); policies are set by *the project* (`.env` is sensitive, build dir is read-only). One knob can't carry both without getting tangled.
- Defense in depth: event handlers fire **after** the config layer decides but **before** the tool executes — so an event rule like "never touch `.env`" holds even in `background`/auto-approve mode.
- This lesson is explicitly conceptual/no-code-in-build-along; the event bus itself is deferred to Module 11 (Extension Points), where `tool_call` is one of five lifecycle events.
- Companion exercise idea (not required): a `riskScore(command)` function (0-100) — writes to disk +30, network +20, file deletion +50, config edits +40, read-only 0 — with a `--risk-threshold` flag, auto-approving below threshold and logging every auto-approval for audit.

**Code patterns:**
```ts
// src/approval-events.ts (sketch)
harness.on("tool_call", async (event) => {
  const { toolName, input } = event;
  if (toolName === "write" && input.path.endsWith(".env")) {
    return { block: true, reason: "Cannot modify .env files" };
  }
  if (toolName === "bash") {
    event.input.command = `sandbox-exec -p '(deny default)' ${input.command}`;
  }
  return { block: false };
});
```

**Applies to numa:**
- numa doesn't have an approval-config layer at all today (no interactive/background/delegated mode) — the multi-agent harness goal (orchestrator → specialist workers) is exactly the "delegated" case this table describes, so worth deciding explicit trust semantics when workers get their own file-write tools.
- The event-layer idea (block/modify per tool call regardless of mode) maps directly onto a concrete numa need: protecting sandbox paths outside the game project, or blocking `write_file`/`delete_file` calls to files owned by the toolkit rather than the game code — a `tool_call` interceptor is a cleaner fit than baking that logic into every tool's own `execute`.
- Not applicable as-is: CI/background auto-approve mode — numa's tools currently execute directly inside the Daytona sandbox without a human-approval gate on individual calls, so introducing this pattern would be new scope, not a retrofit.

## Module takeaways for numa
1. numa already has the "real" version of `askUser` via `ask_player`'s no-`execute` suspend/resume — the win here is tightening the *prompt protocol* (search → ask → act, explicit ambiguous-vs-specific examples), not building new plumbing.
2. The event-bus concept (block/modify per tool call, independent of any approval "mode") is a clean seam for numa's file-protection needs (toolkit files, sandbox path boundaries) once the multi-agent harness needs per-worker trust boundaries.
3. Config (who decides) vs. events (what policy applies) is a useful vocabulary for numa's planned orchestrator/specialist-worker split: the orchestrator sets trust per delegated worker (config), while cross-cutting rules like "never touch the toolkit bundle" belong at the event layer.
