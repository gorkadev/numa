# Module 5 — Context Management
Source lessons:
- The Problem — https://vercel.com/academy/build-ai-agent-harness/the-problem
- Pruning Old Results — https://vercel.com/academy/build-ai-agent-harness/pruning-old-results
- Tool Output Design — https://vercel.com/academy/build-ai-agent-harness/tool-output-design
- Cache Control — https://vercel.com/academy/build-ai-agent-harness/cache-control

## The Problem
**Core idea:** Every step of a `ToolLoopAgent` run resends the *entire* message history to the model, so input tokens grow linearly with step count while output tokens stay flat — and nothing leaves context on its own. Before fixing this, instrument it with `onStepFinish` so the growth is visible and measurable.

**Key points:**
- Wire `onStepFinish: ({ usage, stepNumber }) => {...}` on `ToolLoopAgent` and log `usage.inputTokens` / `usage.outputTokens` to `console.error` (not `console.log`, which mixes with the agent's actual response).
- Concrete example curve from the lesson: input goes 1,200 → 2,800 → 4,100 → 8,900 → 9,200 across 5 steps while output stays in the 180–600 range — illustrating "climbs every step" vs. "roughly flat."
- Rough budget table given by the lesson:
  | Component | Tokens | Behavior |
  |---|---|---|
  | System prompt | ~500 | Fixed, sent every call |
  | Each tool result | 200–2,000 | Stays in history forever |
  | After 20 tool calls | 4,000–40,000 | Linearly accumulating |
- Stated failure mode once context gets large (200K window, hit in "30 to 50 steps" for a busy agent reading big files): instructions at the top get pushed out of attention, the model starts ignoring its own system prompt, tool selection degrades, the agent loops or hallucinates.
- Explicitly-named **non-fixes**: hoping it doesn't happen ("it always happens on real tasks"), reducing step count ("ten steps is too few for real work, fifty is normal"), using a bigger model ("delays the problem, doesn't solve it... costs more per token").
- Deliberate lesson structure: this lesson only measures, doesn't fix — "you can't tell whether a fix worked unless you measured the problem first."

**Code patterns:**
```ts
const agent = new ToolLoopAgent({
  model: "anthropic/claude-haiku-4-5",
  instructions: buildSystemPrompt({ /* ... */ }),
  tools,
  stopWhen: stepCountIs(15),
  onStepFinish: ({ usage, stepNumber }) => {
    console.error(`Step ${stepNumber}: ${usage.inputTokens} input, ${usage.outputTokens} output`);
  },
});
```
API surface used: `ToolLoopAgent` (from `ai`), its `onStepFinish` callback receiving `{ usage, stepNumber }`, and `usage.inputTokens` / `usage.outputTokens`.

**Applies to numa:**
- numa already has a per-turn token cost ledger, but this lesson's specific instrumentation (`onStepFinish` logging per-*step*, not just per-*turn*) is a finer grain than numa likely has today — worth adding at the step level inside the `chat.agent` loop to see exactly which step of a 25-step run is driving cost, especially once multi-agent phases fan out into specialist workers.
- The "bigger model doesn't fix it, just delays it" point is directly relevant to numa's tiered Gemini models (3.1-pro-preview / 3.8-flash / 3.5-flash-lite) — routing a long task to a bigger-context model masks the growth problem rather than solving it; the module's actual fixes (pruning, caps, caching) are model-agnostic and should be applied regardless of which Gemini tier is in use.
- "Nothing leaves context on its own" is exactly numa's stated problem: history is replayed from Postgres each turn and each step re-sends accumulated context, so this lesson's diagnosis maps 1:1 onto numa's current architecture.

## Pruning Old Results
**Core idea:** `prepareCall` runs before every model call and can rewrite the outgoing `messages`; calling `ai`'s `pruneMessages({ messages, toolCalls: "before-last-3-messages" })` inside it drops old tool call/result pairs while keeping the original user prompt and the most recent turns, flattening the token-growth curve from a straight line to a plateau.

**Key points:**
- The fix is genuinely small ("four lines, one import") — most of the code is the guard for the first-call case.
- **Must spread `...options` first** in `prepareCall` — forgetting it silently drops `model`, `tools`, `system` from the outgoing request and breaks the agent in confusing ways.
- **Must guard `messages` being undefined** — on the very first call the SDK provides a `prompt` field but no `messages` array yet; calling `pruneMessages({ messages: undefined })` throws.
- `toolCalls: "before-last-3-messages"` keeps the last **three messages of conversation** (not just three tool-call pairs) — described as "a reasonable default that works well across task shapes." `before-last-1` is more aggressive/saves more tokens; `before-last-5` is gentler/keeps more context. The right number is task-dependent — the lesson's own exercise is to tune this by finding the point at which the agent "loses the thread" of something it read several steps earlier.
- The original user prompt (message 0) always survives pruning; only the middle of the conversation — where tool results pile up — gets dropped on each call.
- Example before/after curve: without pruning, input climbs 1,200 → 2,800 → 4,100 → 8,900 → 9,200; with pruning, it plateaus 1,200 → 2,800 → 3,100 → 3,400 → 3,200. The lesson stresses the *shape* (linear → plateau) matters, not the exact digits, which vary by project/file sizes/model/wording.

**Code patterns:**
```ts
import { ToolLoopAgent, stepCountIs, tool, pruneMessages } from "ai";

const agent = new ToolLoopAgent({
  // ... existing config
  prepareCall: async (options) => ({
    ...options,
    messages: options.messages
      ? pruneMessages({ messages: options.messages, toolCalls: "before-last-3-messages" })
      : undefined,
  }),
});
```
Key AI SDK names: `pruneMessages` (imported from `"ai"`), `ToolLoopAgent`'s `prepareCall` hook, the `toolCalls` option accepting string presets like `"before-last-3-messages"` / `"before-last-1-messages"` / `"before-last-5-messages"`.

**Applies to numa:**
- This is the single most directly transferable pattern in the module: numa's `chat.agent` already uses `...chat.toStreamTextOptions()` inside `prepareStep` for compaction/steering — check whether that spread already includes `pruneMessages`-equivalent behavior, or whether it needs to be composed in explicitly the way this lesson does (spread options first, guard undefined messages, prune, then hand back).
- Since numa replays full history from Postgres each turn and re-sends accumulated context per step, pruning is likely the highest-ROI context fix available without restructuring the agent — it directly targets the stated cost driver ("each step re-sends accumulated context so cost grows with steps").
- For the planned multi-agent harness, pruning old tool results matters even more once specialist subagents run inside the same or related sandboxes and produce many intermediate tool calls (`read_file`/`list_files` on many game files) that the orchestrator doesn't need verbatim after synthesis — the "keep the last N messages, drop the middle" strategy generalizes to "keep recent + drop stale tool output" regardless of whether it's one agent or several feeding into one orchestrator turn.
- Concrete tuning question for numa: given `write_file`/`replace_text` tool calls on game code (which can be large), is `before-last-3-messages` the right default, or does numa's file-heavy workload argue for a different threshold — this is exactly the tuning exercise the lesson prescribes.

## Tool Output Design
**Core idea:** Pruning cleans up context after the fact; it can't undo the damage of a single oversized tool result. The upstream fix is designing every tool to produce small, structured, *bounded* output by default, with truncation always communicated back to the model so it can paginate.

**Key points:**
- Concrete caps prescribed:
  | Tool | Cap | Why |
  |---|---|---|
  | `read` | 500 lines | Enough to grasp structure without burying the model; supports `offset`/`limit` pagination |
  | `grep` | 50 matches | 50 results answers the question; 500 would be "a data dump" |
  | `bash` | 5,000 characters of stdout | Most output fits; installs/builds produce noise the model doesn't need |
- These numbers are explicitly **not sacred** — "tuned by running real tasks and noticing what hurts." Raise the cap if long output regularly matters; lower it if the workload is mostly fast searches.
- **`bash` keeps the tail, not the head**, when truncating (`stdout.slice(-MAX_BASH_CHARS)`), because failures/errors/stack traces "usually live at the end" — build output and test failures print their failure last. This is opposite of what you might intuitively cap (the head).
- **The truncation contract (three parts, stated explicitly):** (1) cap the output at a reasonable limit, (2) tell the model it was truncated and by how much, (3) provide pagination parameters where supported (`offset`/`limit` on `read`, narrower glob patterns on `grep`).
- Explicit warning: "A tool that silently truncates is worse than no truncation at all, because the model thinks it has the full picture and acts on incomplete data."
- Named tradeoff: bounded output is "a tax the agent pays in pagination" — a 2,000-line file now needs 4 `read` calls instead of 1, and that's accepted as the right tradeoff (cheaper in tokens/cost than one massive read polluting context for the rest of the session).
- Exercise: make caps configurable per-caller (a `caps` config object passed to tool factories) so a quick-check subagent can use a smaller cap (e.g. 100 lines) and a deep-analysis agent a larger one (e.g. 2,000) — flagged tradeoff: more configurability means more ways for a caller to misconfigure it, so the exercise explicitly asks "where's the right default?"

**Code patterns:**
```ts
// bash cap, tail-keep
const MAX_BASH_CHARS = 5000;
const stdout = result.stdout || "(no output)";
const cappedStdout =
  stdout.length > MAX_BASH_CHARS
    ? stdout.slice(-MAX_BASH_CHARS) + `\n... (truncated, showing last ${MAX_BASH_CHARS} chars)`
    : stdout;
```
```ts
// grep cap, with total-count suffix
const MAX_MATCHES = 50;
const truncated = lines.length > MAX_MATCHES;
const result = truncated ? lines.slice(0, MAX_MATCHES) : lines;
return truncated
  ? result.join("\n") + `\n... (${lines.length} total, showing first ${MAX_MATCHES})`
  : result.join("\n") || "No matches found.";
```
No new AI SDK APIs here — this is plain tool-implementation discipline (input/output shaping inside `execute`), not an SDK feature.

**Applies to numa:**
- Directly applicable to all five of numa's file tools. Check each against the three-part contract:
  - `read_file` — does it cap lines with `offset`/`limit` pagination, or return whole game files (which can be large Three.js/toolkit source) unbounded?
  - `list_files` — does it cap entries with a count suffix, or dump the whole game directory tree?
  - `write_file` / `replace_text` / `delete_file` — these are write tools, so the *input* isn't the concern, but their *return value* (confirmation message, diff, or echoed content) should stay small and not echo back the full file.
- The tail-keep-on-truncation trick doesn't apply to numa's current toolset directly (no raw `bash` tool listed) but is highly relevant if a headless-verifier tool is added that runs the game and captures logs/errors — verifier output is exactly the "errors live at the end" case this lesson is written for.
- The "silent truncation is worse than no truncation" warning is a good audit item: if `list_files` or `read_file` currently truncates without telling the model, that's a latent bug this lesson names precisely — the model would act on an incomplete game file listing without knowing it's incomplete.
- The configurable-caps exercise maps well onto the planned multi-agent harness: a fast orchestrator-tier read (small model, quick routing decision) plausibly wants a smaller cap than a specialist worker doing deep file analysis — worth deciding the default before subagents multiply the number of callers.

## Cache Control
**Core idea:** Pruning removes stale messages; cache control avoids re-billing for the *stable* parts of what remains. `addCacheControl` marks the system message and older-but-kept messages as cacheable via `providerOptions.cacheControl`, composed *after* pruning in the same `prepareCall` pipeline.

**Key points:**
- **This is explicitly provider-specific.** `cacheControl: { type: "ephemeral" }` is "the Anthropic-flavored shape." OpenAI uses different headers/a different model; some providers don't expose prompt-level caching at all. Calling it on an unsupported provider doesn't break the call — "the header just gets ignored." **This is the load-bearing fact for numa, which runs Gemini via Vertex, not Anthropic** — see "Applies to numa" below.
- Cache breakpoints work **by prefix**: marking message N cacheable caches everything up to and including message N; the provider checks the prefix match on the next call. This is why order matters (mark the *stable* early messages, not the *volatile* recent ones).
- Rule implemented: message 0 (system/initial prompt) is always cacheable; all messages except the **last two** are cacheable; the most recent 1–2 messages stay uncached because "they're about to be replaced" anyway.
- Pipeline order matters: prune first (changes how many messages exist), then cache (marks whatever survives pruning) — `addCacheControl(pruneMessages(...))`.
- Illustrative savings table (labeled as provider/hit-rate dependent, "for a typical Anthropic-backed agent running long sessions"): 50 calls × 200K input tokens each, ~10M tokens total, going from ~$30/session uncached to ~$6/session cached — described as "an order-of-magnitude swing on long sessions," with diminishing benefit on short sessions since the cache doesn't have time to amortize.
- Value of the pattern even without provider support: forces you to identify which parts of the prompt are stable vs. rebuilt every call — described as useful independent of whether caching exists, because stable context is "easier to test, easier to version, easier to reason about."
- To observe cache hits: log `usage.cachedInputTokens ?? 0` alongside the existing `usage.inputTokens`/`usage.outputTokens` from lesson 16 — on a supporting provider, `cachedInputTokens` should grow from step 1 while the full-price `inputTokens` stays small.

**Code patterns:**
```ts
// src/cache.ts
import type { ModelMessage } from "ai";

export function addCacheControl(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg, i) => {
    if (i === 0) return { ...msg, providerOptions: { cacheControl: { type: "ephemeral" } } };
    if (i < messages.length - 2) return { ...msg, providerOptions: { cacheControl: { type: "ephemeral" } } };
    return msg;
  });
}
```
```ts
// index.ts — composed pipeline
prepareCall: async (options) => {
  const pruned = options.messages
    ? pruneMessages({ messages: options.messages, toolCalls: "before-last-3-messages" })
    : undefined;
  return { ...options, messages: pruned ? addCacheControl(pruned) : undefined };
},
```
API surface: `ModelMessage` type from `"ai"`, per-message `providerOptions.cacheControl` field (Anthropic-specific shape `{ type: "ephemeral" }`), and `usage.cachedInputTokens` on the step-finish usage object.

**Applies to numa — provider-specific note (Gemini/Vertex vs. Anthropic):**
- **This lesson's exact code (`providerOptions: { cacheControl: { type: "ephemeral" } }`) is Anthropic's shape and is not what Gemini/Vertex uses.** The lesson itself flags this generically ("OpenAI uses different headers and a different model... the exact `providerOptions` shape doesn't [survive]"), and it applies with full force to numa, which runs exclusively on Gemini via Vertex (3.1-pro-preview / 3.8-flash / 3.5-flash-lite) — the Anthropic snippet must not be copied verbatim into numa's `prepareCall`.
- Gemini/Vertex has its own caching mechanism (context/implicit caching on Vertex AI, keyed differently from Anthropic's per-message ephemeral breakpoints — e.g. explicit cached-content resources or automatic prefix caching depending on the Vertex API surface in use) — **do not assume feature parity or API shape; verify Gemini/Vertex's actual caching contract against current Vertex AI docs before implementing**, since this course only covers the Anthropic shape and explicitly declines to cover others.
- If the harness composes a `providerOptions.cacheControl` block that Vertex/Gemini doesn't recognize, the lesson's own claim is that it's silently ignored rather than erroring — meaning a naive port of this exact code into numa's AI SDK v7 Gemini provider config would likely be a silent no-op, not a caching win. Any caching work for numa needs a Gemini/Vertex-specific caching lookup (candidate for a Context7 doc check against `@ai-sdk/google-vertex` / Vertex's caching support) before implementation, not a copy of this lesson's snippet.
- The **pattern** (separate stable prefix from fresh suffix in `prepareCall`, compose after pruning) is provider-agnostic and worth adopting regardless of whether Gemini's specific caching API is wired up — it's a design discipline numa's `prepareStep`/`prepareCall`-equivalent pipeline can adopt today even before confirming Vertex cache support.

## Module takeaways for numa
1. **Pruning is the highest-value, most directly portable fix here.** numa's stated cost driver — each step re-sends accumulated context — is precisely what `pruneMessages`-style logic (or an equivalent already inside `chat.toStreamTextOptions()`) is built to solve; verify whether it's already active and, if not, wire it into `prepareStep`, mirroring the "spread options first, guard undefined messages" gotchas from lesson 17.
2. **Audit numa's five tools against the three-part truncation contract** (cap, communicate truncation + count, offer pagination) before optimizing anything else — an unbounded `read_file`/`list_files` result on a large Three.js game file defeats pruning entirely, since the damage from one oversized tool result happens before pruning ever runs.
3. **Do not port the Anthropic `cacheControl` snippet verbatim.** Gemini/Vertex caching is a different API surface; treat this as an open item requiring a provider-specific doc check (Context7/Vertex AI docs) rather than an implementation ready to copy — flagged explicitly because the course itself only covers Anthropic's shape.
4. **Step-level token telemetry (`onStepFinish` logging input/output per step)** is finer-grained than numa's current per-turn credit ledger and worth adding, especially to see cost distribution across a 25-step run or across summed subagent usage in the planned multi-agent harness.
5. **Bounded output design generalizes to subagent handoffs.** In the planned orchestrator/specialist-worker model, "cap and paginate" applies not just to raw tool output but to what a specialist subagent hands back to the orchestrator (artifacts passed by file reference, not full content) — this module's tool-output discipline is a template for that handoff contract too.
6. **The tail-keep-on-truncation trick is worth reserving for a future headless verifier** — if numa adds a tool that runs the game and captures console/error output, truncating from the tail (not the head) directly matches this lesson's reasoning about where errors surface.
