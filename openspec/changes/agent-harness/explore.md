# Exploration: agent-harness

Multi-agent game-building harness for numa: an orchestrator that plans and
delegates to specialised sub-agents in phases, with isolated contexts, parallel
work where safe, and a model tier per role.

Research inputs: `docs/research/vercel-harness-course/` (course notes, gentle-ai
learnings, decisions so far).

## Current State

numa's chat agent is one Trigger.dev `chat.agent` (`apps/web/trigger/chat.ts`)
running a single `streamText` tool loop (`stopWhen: stepCountIs(25)`,
chat.ts:435) against one Daytona sandbox per game. Five file tools plus
`ask_player` come from `createGameTools(gameId)` (`apps/web/lib/games/tools.ts:197`),
declared both on `chat.agent({ tools })` (chat.ts:124) and on `streamText`, so
`toModelOutput` survives history re-conversion on later turns. The system prompt
is three `SystemModelMessage`s (`apps/web/lib/games/instructions/index.ts`); the
last, `engineInstructions` (`instructions/engine.ts`, 246 lines), is loaded on
every turn.

### Cost ledger

- `onBeforeTurnComplete` (chat.ts:288) writes a transient `data-turn-credits`
  chunk (`apps/web/lib/games/turn-credits.ts:42`) computed by `turnCreditCost`
  (`apps/web/lib/ai/pricing.ts:238`).
- `onTurnComplete` (chat.ts:344) persists the thread with `withTurnMeta`
  (`apps/web/lib/ai/message-meta.ts:91`) and calls `recordTurnUsage`
  (`apps/web/lib/games/usage.ts:77`, append-only, swallows errors, ingests to
  Polar).
- The `usage` these hooks receive covers only the orchestrator's own
  `streamText` (numa's code comment and Trigger.dev's `TurnCompleteEvent.usage`
  reference agree). Sub-agent usage needs new summation plumbing before these
  four places report the true turn total.

### AI SDK v7 (installed 7.0.93, verified in source)

- `ToolLoopAgent` (`ai/src/agent/tool-loop-agent.ts`) wraps
  `generateText`/`streamText`, has `prepareCall`, and `.generate()`/`.stream()`
  expose `usage`/`totalUsage` in-process.
- `pruneMessages` (`generate-text/prune-messages.ts`) supports
  `toolCalls: "before-last-N-messages"`.
- Multiple tool calls in one step execute concurrently via `Promise.all`
  (`generate-text/execute-tools-from-stream.ts:222`).
- Gemini parallel function calling is native model behaviour; `@ai-sdk/google`
  exposes `functionCallingConfig.mode` but no parallel toggle. Vertex docs claim
  support; one third-party client reported breakage on Vertex Gemini, so this
  needs a spike against `@ai-sdk/google-vertex@5.0.76` before relying on N
  parallel specialist calls in one step.

### Trigger.dev chat.agent (installed @trigger.dev/sdk 4.5.16)

1. **`AgentChat`** (docs `ai-chat/patterns/sub-agents.mdx`, class in
   `dist/esm/v3/chat-client.js`) — durable sub-agents. A tool `execute` is an
   async generator: `new AgentChat({ agent, id, clientData })`,
   `yield* stream.messages()` streams nested `UIMessage` snapshots to the
   frontend as preliminary tool results, `toModelOutput` compresses what the
   parent sees, `chat.stream.writer({ target: "root" })` lets a specialist push
   `data-*` progress to the parent stream. Cleanup via `close()`, idle timeout
   or suspend timeout.
2. **Native skills** (docs `ai-chat/patterns/skills.mdx`, `dist/esm/v3/skill.js`)
   — `skills.define({ id, path })` + `chat.skills.set([...])` bundle a
   `SKILL.md` folder and auto-inject `loadSkill`, `readFile` and `bash` through
   `chat.toStreamTextOptions()`.

Also: `chat.toStreamTextOptions()` injects `prepareStep` for compaction, so any
custom `prepareStep`/pruning must compose with it rather than replace it.
`trigger.config.ts:11` sets `maxDuration: 3600`, the ceiling for a whole turn
including awaited sub-agent work.

### UI

`apps/web/lib/games/tool-parts.ts` and `apps/web/components/chat/tool-group.tsx`
render a flat list of tool parts, coalesced when consecutive, labelled from a
hardcoded `TOOL_LABELS` map. There is no nested or sub-agent concept; a separate
sub-agent view is new surface.

### Sandbox and verification

`apps/web/lib/daytona/utils.ts` — `createGameSandbox` provisions the default
(Python, no browser) image; `startGameServer` only checks that the static server
answers on a port. Nothing checks for console errors. `@daytona/sdk@0.211.2`
ships `ComputerUse`, which is desktop GUI automation (mouse, keyboard,
screenshots against an X server), not a headless "does it run" check.
`daytona.create()` accepts `image` or `snapshot`, so a custom image with
Chromium is possible. The five file tools have no locking or ownership:
parallel writers on one sandbox are unprotected.

## Affected Areas

- `apps/web/trigger/chat.ts` — orchestrator loop, lifecycle hooks, usage wiring.
- `apps/web/lib/games/tools.ts` — needs a file-ownership-scoped variant for specialists.
- `apps/web/lib/ai/pricing.ts`, `apps/web/lib/games/usage.ts`,
  `apps/web/lib/ai/message-meta.ts`, `apps/web/lib/games/turn-credits.ts` — cost
  ledger needs a sub-agent usage input.
- `apps/web/lib/games/instructions/engine.ts`, `index.ts` — skills migration candidate.
- `apps/web/lib/games/tool-parts.ts`, `apps/web/components/chat/tool-group.tsx` — nested rendering.
- `apps/web/lib/daytona/utils.ts` — no verification exists.
- `apps/web/trigger.config.ts:11` — shared `maxDuration` ceiling.

## Approaches

1. **In-process `ToolLoopAgent` sub-agents.** Pros: trivial usage summation,
   reuses `createGameTools`, `Promise.all` parallelism. Cons: not durable (a
   crash loses in-flight specialist work), everything counts against the same
   3600 s ceiling, separate-view streaming is hand-built. Effort: Medium.
2. **Trigger.dev durable `AgentChat` sub-agents.** Pros: per-role durability and
   `maxDuration`, native nested `UIMessage` streaming for the separate view,
   `toModelOutput` caps orchestrator context, `chat.stream.writer` progress
   channel. Cons: usage bridging is not automatic, more task-definition surface,
   parallel specialists become parallel runs (concurrency and queue limits).
   Effort: Medium-High.
3. **Hybrid, phase-routed (recommended by explore).** In-process for read-only
   understand/design; `AgentChat` for write-capable parallel specialists. Cons:
   two mechanisms to maintain. Effort: Medium-High.

## Recommendation (explore phase)

Hybrid, sequenced so the two hardest unknowns — accurate sub-agent usage
summation and safe concurrent sandbox writes — are proven on a single specialist
before parallelism ships.

| Phase / role | Tools | Model | Mechanism | Step budget |
|---|---|---|---|---|
| Orchestrator | full `createGameTools` | gemini-3.8-flash | `chat.agent` (unchanged) | 25 |
| Understand (explorer) | read_file, list_files | gemini-3.5-flash-lite | in-process `ToolLoopAgent` | 5-8 |
| Design | read-only + reasoning | gemini-3.1-pro-preview | orchestrator or small in-process agent | small |
| Gameplay / visuals / audio | scoped write tools, owned files only | gemini-3.8-flash | `AgentChat` | 15-20 |
| Verify | scoped read + run/console check (TBD) | gemini-3.8-flash or 3.1-pro-preview | TBD | small |

## Risks

1. Sub-agent usage summation is unsolved for both shapes; shipping first risks
   under-billing against the Polar credit ledger.
2. `maxDuration: 3600` is a shared ceiling with no per-phase timeout budget.
3. Gemini on Vertex with parallel tool calls is not yet spiked in this project.
4. No verification mechanism exists; the default sandbox has no browser.
5. The thread UI has no sub-agent concept; the separate view is new surface.
6. Skills migration trades a guarantee (API always in context) for a probability
   (model calls `loadSkill`); needs before/after comparison.
7. No file ownership in the game tools; parallel writers are unprotected.

## Orchestrator verification (added after the explore phase)

- Confirmed in the installed SDK: `AgentChat` (`chat-client.js`) and native skills
  (`skill.js`, `chat.skills.set` in `ai.d.ts:3190`) exist in 4.5.16.
- **Security constraint on native skills.** `skills.mdx:24` states that skill
  scripts "run directly in the Trigger.dev worker container, no sandboxing
  required", and `bash` only sets `cwd` to the skill root (`skills.mdx:139,201`).
  In numa the model is driven by player input, so an injected prompt could run
  arbitrary commands in the worker and read its environment (database, Polar and
  Daytona credentials). Native skills must not expose `bash` to the game agent:
  either override it (the docs state app tools win on name conflicts,
  `skills.mdx:182`) or use only a hand-written `loadSkill`. Skills here are
  instructions, not scripts; any executable step belongs in the Daytona sandbox.

## Product Decisions (confirmed by the user, 2026-09-11)

1. **Mechanism: in-process everywhere.** Every sub-agent is an AI SDK
   `ToolLoopAgent` run inside the orchestrator's turn. `AgentChat` is a possible
   later evolution, not part of this change. This overrides the explore
   recommendation (hybrid): one mechanism, trivial usage summation, reuse of
   `createGameTools`, and the turn is already durable inside `chat.agent`.
2. **Usage bridging: in-process summation.** Each sub-agent's total usage is
   added to the orchestrator's turn usage, so the credits chunk, `withTurnMeta`,
   the ledger and Polar ingestion all see the true turn total. Per-sub-agent
   usage is also kept so the sub-agent view can show it.
3. **Verification: headless browser.** A custom Daytona image or snapshot with
   Chromium runs the game, reads console errors and takes a screenshot. Starts
   with a spike to prove the image, latency and cost.
4. **Concurrency: enforced file ownership.** Each task declares the files it
   owns; the write tools given to a worker reject paths outside that set.
   Parallel workers only run on disjoint ownership.
5. **Skills: registry + push + pull fallback (gentle-ai model).** The engine
   instructions become a skill registry in code (name, description, trigger).
   Each role receives its default skills in its instructions deterministically;
   the orchestrator adds extra skills from the registry when delegating; a
   hand-written `loadSkill` tool (no `bash`, size-capped) is the fallback. The
   Trigger.dev native skills `bash` tool is never exposed.
6. **Sub-agent UI: in scope, surface open.** Sub-agents are shown in a separate
   view (model, tool calls, edits, tokens), opened from a slash-command palette
   in the composer or a thread-header button. The exact surface is a design
   decision.

Carried constraints: route by size (small tweak = orchestrator edits directly;
new game or big feature = phases); `ask_player` stays orchestrator-only;
workers never delegate; model tier per role from the catalog (3.1-pro-preview,
3.8-flash, 3.5-flash-lite); no test runner, so verification of the code is
typecheck and lint.
