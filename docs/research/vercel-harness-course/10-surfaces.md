# Module 10 — Surfaces
Source lessons:
- CLI Entry Point — https://vercel.com/academy/build-ai-agent-harness/cli-entry-point
- Streaming and Tool Rendering — https://vercel.com/academy/build-ai-agent-harness/streaming-and-tool-rendering
- Web Surface — https://vercel.com/academy/build-ai-agent-harness/web-surface

## CLI Entry Point
**Core idea:** Formalize the ad hoc `bun run index.ts . "prompt"` entry point into a real CLI: `parseArgs` for flags, a sandbox factory driven by a `--sandbox` flag, and guaranteed cleanup (`sandbox.stop()`) on both normal exit (`finally`) and `SIGINT`.

**Key points:**
- Uses `parseArgs` from `node:util` with `allowPositionals: true` to mix `--sandbox`/`--model` flags with positional `cwd` and prompt args.
- `sandboxFromFlag(name, cwd)` is a one-line switch over sandbox backends (`"local"`, `"just-bash"`, etc.) — the factory pattern, not hardcoded instantiation.
- Cleanup discipline: wrap the agent run in `try { ... } finally { await sandbox.stop(); }` for normal/thrown exits, **and** register a separate `process.on("SIGINT", ...)` handler that also calls `sandbox.stop()` before `process.exit(0)` — these are two different exit paths (uncaught exception vs. explicit user interrupt) that both need the same cleanup.
- Why this matters at all: for a local sandbox, skipping cleanup costs nothing; for a **cloud** sandbox, skipping it leaves a VM running on someone's bill. The `finally`/`SIGINT` duplication is deliberate, not sloppy.
- Key framing: "the CLI is a thin wrapper" — almost nothing in `index.ts` is CLI-specific. The agent, tools, prompt, and sandbox are all surface-agnostic; only ~5-6 lines (`parseArgs` + the signal handler) are what changes if you build a different surface (web server, Slack bot, IDE extension).
- Uses `ToolLoopAgent` from `ai` with `stopWhen: stepCountIs(15)`, a `prepareCall` hook that prunes messages (`pruneMessages({ messages, toolCalls: "before-last-3-messages" })`) and applies cache control, and `onStepFinish` for per-step token usage logging.
- Exercise idea (not built): `--session=<id>` flag to load/save prior run messages to disk via `agent.generate({ prompt, messages })`, raising unanswered questions about file location, corruption handling, and version-stamping sessions against harness changes.

**Code patterns:**
```ts
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    sandbox: { type: "string", default: "local" },
    model: { type: "string", default: "anthropic/claude-haiku-4-5" },
  },
  allowPositionals: true,
});

process.on("SIGINT", async () => {
  console.error("\nShutting down...");
  await sandbox.stop();
  process.exit(0);
});

try {
  const { text, steps } = await agent.generate({ prompt });
  console.log(text);
} finally {
  await sandbox.stop();
}
```
`ToolLoopAgent`, `stepCountIs`, `pruneMessages` are all imported directly from `ai` (AI SDK v7) — note `stopWhen: stepCountIs(15)` as the step-budget API, and `prepareCall` as the per-call message-shaping hook.

**Applies to numa:**
- Not directly applicable as a CLI — numa has no CLI surface; its harness runs inside a Trigger.dev `chat.agent` task, not a terminal process.
- The underlying principle transfers: the agent/tools/prompt/sandbox code should stay surface-agnostic so it doesn't matter whether the caller is a CLI, a web UI, or (in numa's case) a Trigger.dev task — worth auditing numa's `chat.agent` task to confirm business logic isn't leaking Trigger-specific concerns into what should be portable agent code.
- The cleanup discipline (guaranteed sandbox teardown on both normal completion and interruption) is directly relevant to numa's Daytona sandbox lifecycle — worth verifying numa's `chat.agent` task has equivalent guaranteed cleanup (via Trigger.dev's own lifecycle hooks / `finally` semantics) so a cancelled or failed run doesn't leak a Daytona sandbox.
- `pruneMessages`/cache-control patterns are relevant to numa's context-management story for long chat threads, independent of the CLI framing.

## Streaming and Tool Rendering
**Core idea:** Swap blocking `agent.generate()` for `agent.stream()` and iterate `result.fullStream`, routing `text-delta` chunks to stdout (the actual response) and `tool-call`/`tool-result` chunks to stderr (meta, not part of the response) — the whole CLI-facing change is this stream/switch, nothing else.

**Key points:**
- `agent.stream({ prompt })` returns a `result` whose `fullStream` is an async iterable; `for await (const chunk of result.fullStream)` is the natural consumption loop.
- Chunk-type switch: `text-delta` → `process.stdout.write(chunk.textDelta)` (no newline, streams token by token); `tool-call` → log tool name + JSON args to stderr; `tool-result` → log a truncated preview (slice to ~100 chars) to stderr.
- Deliberate stdout/stderr split: redirecting stderr away (`2>/dev/null`) leaves *only* the model's actual text response in stdout — tool noise never contaminates the answer channel. This is presented as a concrete acceptance test for the split.
- Suggested per-tool rendering table (a hint, not mandatory — plain generic `tool-call`/`tool-result` logging covers most needs; per-tool formatting "earns its place when one tool's output is consistently noisy"):
  | Tool | Render as |
  |---|---|
  | `read` | File path and line count |
  | `grep` | Match count and first three matches |
  | `bash` | Command and exit code |
  | `write` | File path and byte count |
  | `edit` | File path and "1 replacement" |
  | `task` | Subagent type and step count |
  | `askUser` | Full question and option list |
- Explicit caveat: inline approval (blocking on user input mid-tool-call) gets structurally harder once you're streaming — pausing/resuming a stream is "an interaction loop, not a chunk handler," and the full pattern is deferred to the Module 11 events/extensibility lesson. For now, a block-and-report tool result (Module 8's pattern) is still the right behavior even under streaming.

**Code patterns:**
```ts
const result = await agent.stream({ prompt });

for await (const chunk of result.fullStream) {
  switch (chunk.type) {
    case "text-delta":
      process.stdout.write(chunk.textDelta);
      break;
    case "tool-call":
      console.error(`\n[tool] ${chunk.toolName}(${JSON.stringify(chunk.args)})`);
      break;
    case "tool-result": {
      const preview = typeof chunk.result === "string"
        ? chunk.result.slice(0, 100)
        : JSON.stringify(chunk.result).slice(0, 100);
      console.error(`  -> ${preview}`);
      break;
    }
  }
}
```
Note: `chunk.type` values (`text-delta`, `tool-call`, `tool-result`) and `chunk.textDelta`/`chunk.toolName`/`chunk.args`/`chunk.result` field names are the AI SDK's `fullStream` chunk shape — worth double-checking against numa's installed AI SDK version, since chunk field naming has shifted across AI SDK versions historically.

**Applies to numa:**
- numa's chat UI already streams via `useChat` and renders grouped tool parts — the *concept* (route text deltas to the conversational surface, route tool activity to a separate rendering path) is already implemented in numa's product, just via React state/parts instead of stdout/stderr.
- Directly relevant to numa's planned "subagents shown in a separate view" goal: this lesson's stdout/stderr separation is the CLI analog of what numa wants at the UI level — tool/subagent activity as a parallel channel, not interleaved into the main chat response. The same discipline (don't let tool noise contaminate the answer channel) should guide how orchestrator/subagent step events get surfaced.
- The inline-approval-vs-streaming tension is worth flagging for numa if any future gate needs to pause mid-stream — numa's `ask_player` sidesteps this today because the whole run suspends (durable, not an in-stream pause), which is arguably a cleaner solution than what this lesson defers.

## Web Surface
**Core idea:** A concept-only lesson: the same headless agent serves both CLI and web surfaces unchanged — the agent takes `prompt` (and optional `messages`) and returns a stream of chunks; everything web-specific (persistence, HTTP streaming, component rendering, resumability) lives entirely in the surface layer, never inside the agent.

**Key points:**
- Side-by-side comparison table:
  | | CLI | Web |
  |---|---|---|
  | Output | Terminal text | Chat bubbles |
  | Tool calls | stderr lines | Tool result components |
  | Approval | stdin prompt | Button group |
  | Lifetime | Process exit | Session persistence |
  | Streaming | `process.stdout.write` | Server-sent events |
  | Input | One shot from argv | Continuous from the textarea |
- Persistence is the surface's job: `await db.saveMessages(sessionId, messages)` / `db.loadMessages(sessionId)`, then `agent.stream({ prompt, messages })` — the agent doesn't know a database exists.
- Streaming over HTTP sketch: wrap `agent.stream()` inside a `ReadableStream`, `controller.enqueue(\`data: ${JSON.stringify(chunk)}\n\n\`)` per chunk, respond with `Content-Type: text/event-stream` — same chunk shape the CLI consumes, just carried over SSE instead of stdout.
- Tool results become React components instead of text lines:
  | Tool | CLI rendering | Web rendering |
  |---|---|---|
  | `read` | File path and line count | Code block with syntax highlighting |
  | `grep` | Match count and first matches | Search results with file links |
  | `bash` | Command and exit code | Terminal output with exit code badge |
  | `write` | Path and bytes | Diff view |
  | `edit` | Path and "1 replacement" | Inline diff |
  | `askUser` | Question text | Button group with the options |
- Resumable streams: a web surface can pick a tab back up mid-response (if the agent run is still live) or from persisted state (if not) — something a CLI structurally can't do, since there's no surface to return to after the process exits.
- Explicit architectural warning: "the agent does not know there is a web." If you catch yourself adding "is this web?" branches inside the agent, that's the abstraction leaking — pull the special case back into the surface layer.
- This module ships no working web code — it's explicitly a sketch/exercise (build a Next.js route wrapping `agent.stream()`, pipe SSE, consume with `EventSource`/`ReadableStream` client-side) meant to prove the separation stays clean.

**Code patterns:**
```ts
// src/route.ts (sketch)
export async function POST(req: Request) {
  const { prompt, sessionId } = await req.json();
  const messages = await loadMessages(sessionId);
  const stream = new ReadableStream({
    async start(controller) {
      const result = await agent.stream({ prompt, messages });
      for await (const chunk of result.fullStream) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}
```

**Applies to numa:**
- This is the architectural principle numa already lives by, mostly — numa's `chat.agent` task is the headless agent, and the React `useChat` frontend is the surface; the lesson's warning ("if you find yourself adding 'is this web?' branches to the agent, pull it back out") is a good audit checklist for numa's `chat.agent` task as multi-agent/orchestrator logic gets added — orchestrator routing and phase logic should stay surface-agnostic even though numa currently has only one surface (the web chat).
- The tool-results-as-components table is effectively what numa already implemented (tool parts grouped and rendered in the UI) — no new idea here, but useful validation that numa's existing design matches this lesson's recommended shape.
- Resumable streams are relevant background for numa's "subagent view opened from a slash command palette" idea: if a subagent's work needs to be inspectable after the fact (not just live), that's the persistence + resumability pattern this lesson describes, not something numa needs to invent from scratch.
- SSE-specific plumbing is not directly applicable — numa already uses Trigger.dev realtime streaming to the frontend, not a hand-rolled `ReadableStream`/SSE route, so this lesson's transport-layer code is illustrative only, not something to port.

## Module takeaways for numa
1. The core "agent does not know about the surface" discipline is the most valuable idea for numa's upcoming orchestrator work — as routing/phase/subagent logic gets added to `chat.agent`, keep it surface-agnostic so it wouldn't need to change if numa ever added a second surface.
2. numa has already solved (via Trigger.dev realtime + `ask_player`'s durable suspend) some things this course only sketches as open problems (inline approval under streaming, resumable sessions) — worth noting where numa's infra is ahead of the course's toy harness rather than assuming the course has answers numa lacks.
3. The stdout/stderr (CLI) and tool-results-as-components (web) separation patterns validate numa's existing "tool parts grouped and rendered separately" UI design and directly support the planned separate subagent view — tool/subagent activity should stay a parallel channel, never interleaved into the main reply text.
4. Not applicable: the CLI-specific plumbing (`parseArgs`, `SIGINT` handling, stdout/stderr routing) — numa has no CLI surface, so this content is background understanding only, not implementation guidance.
