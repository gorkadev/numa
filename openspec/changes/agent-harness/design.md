# Design: Multi-agent game-building harness

## Technical Approach

The orchestrator stays the existing `chat.agent` `streamText` loop. The player picks a **tier**, and the orchestrator runs that tier's `strong` slot, resolved through the model registry (decision 18). It gains four dispatch tools (`explore`, `plan`, `run_tasks`, `verify`) and `load_skill`. Each dispatch tool runs one or more in-process `ToolLoopAgent`s through a shared runner. The runner resolves the role's model as `resolveModel(turnTier, role.slot)`, forwards the abort signal, applies a per-role timeout, records every finished step's usage in a per-turn ledger (`chat.local`) under the concrete registry entry id, streams a compact run record as preliminary tool output, and returns `{ envelope, records }`. The orchestrator's model sees only `envelope`, through `toModelOutput`. Fan-out runs inside `run_tasks` with a concurrency cap and a `Promise.all`-style wait, so correctness never depends on the model emitting parallel calls. Large artifacts (design, tasks, screenshots) live under `.numa/` in the sandbox and are passed by path.

APIs checked against the installed sources: `ToolLoopAgent` (`ai/src/agent/tool-loop-agent.ts`, `.stream()`, `timeout`, `onStepEnd`), `hasToolCall` and `isStepCount` (aliased as `stepCountIs`), `activeTools`, and async-generator `execute` with preliminary results plus `toModelOutput({ output })` (`ai/docs/03-agents/06-subagents.mdx`). `providerOptions` is accepted by `streamText` and `ToolLoopAgent`; its `ProviderOptions` type lives in `@ai-sdk/provider-utils` and is not re-exported by `ai`, so the registry derives it from the `streamText` parameter type. Gemini reasoning effort is `thinkingConfig.thinkingLevel` (`"minimal" | "low" | "medium" | "high"`, `@ai-sdk/google` 4.0.64 `dist/index.d.ts`). On the Trigger.dev side: `chat.local` initialised in `onBoot`, the roughly 1 MiB per-chunk limit (`patterns/large-payloads.mdx`), and the `prepareStep` that `toStreamTextOptions` injects (`compaction.mdx`). On Daytona: `snapshot.create({ image })`, `Image.base().runCommands()`, and `process.executeCommand(command, cwd, env, timeout)` (timeout in seconds).

## Architecture

```
chat.agent run (trigger/chat.ts)   clientData = { tier? }  (closed TierId enum)
 ├─ onBoot: turnState.init()        onTurnStart: turnState.reset(turn, deadline, tier)
 ├─ streamText(orchestrator = resolveModel(tier, "strong"), activeTools by HARNESS flag)
 │    ├─ game tools (createGameTools) + ask_player      [unchanged]
 │    ├─ load_skill                                     lib/games/skills
 │    └─ dispatch tools ── runSubagent() ─┬─ ToolLoopAgent(role, resolveModel(tier, role.slot))
 │         explore / plan / run_tasks /   │    tools: read-only | scoped-write
 │         verify                         │    onStepEnd → turnState.ledger (entry id)
 │                                        └─ yield SubagentRunRecord (preliminary)
 │         verify ── runGameCheck() ── Daytona sandbox: python3 check.py (Playwright)
 ├─ onBeforeTurnComplete: priceTurn(orchestrator usage + ledger) → data-turn-credits
 └─ onTurnComplete: withTurnMeta(cost) ; recordTurnUsage(cost, breakdown) → Polar (1 event)

model-catalog.ts (client-safe)   TierId, labels, DEFAULT_TIER_ID, legacy id → tier
model-registry.ts (server-only)  ModelEntry[], TIER_PROFILES, resolveModel(tier, slot)
models.ts (server-only)          provider factories by ProviderId (google-vertex only)
pricing.ts (server-only)         RATES: Record<ModelEntryId, ModelRate>
```

## Architecture Decisions

| # | Decision | Choice | Rejected alternatives and why |
|---|---|---|---|
| 1 | Roles | See the role catalogue below. Design and tasks come from one **planner** sub-agent, not two, and not the orchestrator. | Orchestrator plans: planning would fill its context, and the planner's slot must stay independent of whatever the orchestrator is doing. Two agents: double the startup tokens for one reasoning act. |
| 2 | Models | Every role, the orchestrator included, declares a **slot** (`strong`, `mid`, `light`) in `roles.ts`, never a model. Its model is `resolveModel(turnTier, role.slot)` (decision 18). The orchestrator is `strong`; the player's pick selects the tier, not the orchestrator's model. | Orchestrator = the player's raw model pick (the previous design): couples the orchestrator to vendor names and lets the pick drag the planner down or up unpredictably. Scaling every role from the pick: the cost of a phased turn would stop being predictable. Fixed model ids per role: a provider swap would touch every role. |
| 3 | Dispatch shape | One tool per phase. `run_tasks` takes a batch of `TaskSpec[]` (at most 4, at most 3 running at once). | A generic `task(role)` tool: the orchestrator loses phase-specific schemas and guards. Relying on the model to emit parallel calls: the Vertex spike risk. |
| 4 | Result | `output = { envelope, records }`. `toModelOutput` renders the envelope as text (≤ 1.5k chars). Errors, aborts and timeouts come back as an envelope `status`, never a throw. | Returning the full `UIMessage` through `readUIMessageStream`: every yield re-sends the file contents in `write_file` inputs, so each chunk grows toward the 1 MiB `ChatChunkTooLargeError` and the jsonb thread bloats. |
| 5 | Progress | The generator consumes the sub-agent's `fullStream` (`tool-call`, `tool-result`, `tool-error`, `finish-step`) and yields a compact record, throttled to 500 ms. Tool parts carry no file contents. | `chat.response.write` data parts: they are not attached to the tool call and would need a second persistence path. |
| 6 | Coexistence with `chat.agent` | All tools, dispatch tools included, are declared on `chat.agent({ tools })` so `toModelOutput` survives re-conversion even after a rollback. The flag narrows them only through `activeTools`. `prepareStep` is never overridden. Sub-agents get their own `prepareCall` with `pruneMessages({ toolCalls: "before-last-3-messages" })`. | Adding tools only when the flag is on: stored `run_tasks` parts would be re-converted raw into the prompt. |
| 7 | Artifacts | `plan` writes `.numa/design.md` and `.numa/tasks.json`. The dispatch code inlines the design into each worker's prompt, so the orchestrator never holds the design body. `.numa/` is readable by every tool and writable only by harness code: a reserved prefix enforced in `resolveGamePath` for writes. | Keeping the plan in orchestrator context: bloats it. Storing it outside `GAME_DIR`: the confined read tools could not reach it, and it would not persist for later turns. |
| 8 | Routing | A prompt rule in `workflow.ts`, plus WHEN TO USE / WHEN NOT TO USE in the `plan` description. Calling `plan` is the route. The code guards are the turn deadline, the verify budget, and ownership that cannot widen beyond `.numa/tasks.json`. The single-loop path stays the default (`HARNESS_PHASES` off) until unit 8. | A classifier pre-call, or a mandatory `route` tool: an extra model call or step on every turn, and small tweaks are the common case. |
| 9 | Usage | Price per run: each sub-agent run and the orchestrator each go through `turnCostMicroUsd` at the rate card of the **concrete registry entry** that ran (ceiling per run), then micro-USD is summed and converted to credits once per turn. Pricing is never keyed by tier or slot. Steps are accumulated from `onStepEnd`, so aborted and failed runs still count their completed steps. | Per-model aggregation: two pro runs could cross the 200K long-context tier together when neither does alone. Credits per run: adds up to N credits of rounding. Pricing by tier: a profile edit would silently re-price stored turns. |
| 10 | Ledger | Still one `turn_usage` row per turn. `model_id` = the orchestrator's concrete registry entry id (still `text`; the three initial entry ids equal today's values), token columns = totals, `cost_micro_usd` = sum. New nullable `usage_breakdown jsonb` column, added with `pnpm db:push`, holding `{ tier, entries[] }` where each entry names its concrete registry entry id. Polar: one event, `externalId` = `gameId:turn` (unchanged), `credits` = total. | A row per agent: breaks the per-turn `credits_ingested_at` repair query and the dedup key, and rounds credits per row. A `tier` column: the tier is descriptive, not a billing key, so it rides in the jsonb. |
| 11 | Ownership | `createScopedGameTools(gameId, owns)` wraps the tool builders exported from `tools.ts`. Reads are unrestricted. `write_file`, `replace_text` and `delete_file` normalise the path with `resolveGamePath`, then apply two independent checks in order: (a) the **protected-prefix guard** — `engine/`, `vendor/` and `.numa/` are rejected for every write tool, the orchestrator's included, whatever ownership was declared (today this protection is prompt-only; only the `index.html` delete is enforced in code, `tools.ts:536`); (b) `isOwned`, for scoped tools. A violation returns `{ error }` naming which check failed. No `ask_player`. | A tool-call event bus: premature, per course module 11. Ownership alone: a task that declares `engine/` would pass it. |
| 12 | Disjointness | `owns` entries are files, or directories ending in `/`. Two entries conflict when they are equal or one is a prefix of the other. `submit_plan` rejects any `owns` entry under `engine/`, `vendor/` or `.numa/`; the write-time guard in decision 11 still applies as a second line. `run_tasks` checks the batch pairwise and rejects any task whose `dependsOn` has not finished this turn. | Locks inside the sandbox: they serialise the work and add failure modes. |
| 13 | Verification | `verify` runs a deterministic check (Playwright Python headless Chromium with SwiftShader WebGL) against `127.0.0.1:3000`, then a **verifier** agent (`strong` slot, no tools) reads the report and a JPEG screenshot. Code decides the console verdict. The model can only add visual failures, never clear one. | The model alone: can claim success. Daytona `ComputerUse`: GUI automation on an X server, and heavy. |
| 14 | Skills | TS modules in `lib/games/skills/`, each `{ name, description, trigger, body }`, typed as a `SkillName` union. `engine.ts` splits into 8 skills. Role defaults are pushed in the instructions. Extras come from `TaskSpec.skills`. `load_skill` is a fallback (≤ 6k chars, truncation marker, unknown name returns `{ error }` listing the valid names, no fs, no `bash`). | `SKILL.md` files: need a Trigger.dev bundling extension and are not typechecked. Trigger native skills: their `bash` tool runs in the worker container, which is a credential exposure. |
| 15 | Run records | Stored as the final tool output inside `games.messages`, so they survive a reload with no new table. Each record carries a stable `agentId`, role, the role's `displayName`, tier, slot, the concrete model (`modelId` = registry entry id and `modelName` = its display name, both stamped at run time so an old record still renders after its entry leaves the registry), steps, tool calls (name, path, ok, ≤ 200-char error), edits, tokens, skills and summary. It carries no cost, because the rate card stays server-only. | A DB table per run: a second write path, and the thread already persists atomically with its cursor. Resolving `modelName` on the client from the registry: pulls the server-only registry into the bundle and breaks on removed entries. |
| 16 | View | Three surfaces, no Next.js route or server action. (a) A thread-header button opens a right `Sheet` (`@workspace/ui/components/sheet`) listing the thread's runs, labelled by bot `displayName` with the role secondary. (b) Each run appears **inline** in the assistant message as one entry, `displayName · current activity`; while the run is in progress the text uses the existing `shimmer` class on `MarkerContent` (the treatment in `components/chat/tool-group.tsx:102` and `thinking.tsx:52`), and when it ends it shows the status without shimmer. (c) Clicking an inline entry, running or finished, opens the same `Sheet` with `selectedRunId = agentId`; a running run's detail keeps updating from the same preliminary records. The run detail is where the concrete model is shown: `modelName`, with tier and slot. The picker never shows it. | A composer slash palette: adds a second input grammar to the box meant for talking to the agent (could come later via `Command`). A side panel: competes with the 3/5 preview split. A full card per run inline: noisy on a 4-task batch; the one-line shimmer entry matches how tool groups already show progress. The model name as the primary label: ties the visible identity to vendor churn and contradicts the tier-only picker. |
| 17 | `ask_player` | Orchestrator-only. Sub-agents never get it and are told to report `blocked`. The prompt says ask only before `plan`. If asked mid-phase, the turn suspends after the step's other calls finish. The next turn sees the plan envelope and `.numa/`, then re-plans or dispatches. | Suspending sub-agents: impossible in-process and out of scope (`AgentChat`). |
| 18 | Model tiers, slots and registry | The player picks a **tier** (`TierId` = `pro` \| `balanced` \| `fast`, closed zod enum; labels are presentation). Each tier has one **profile** (`TierProfile = Record<Slot, ModelEntryId>`) in `model-registry.ts`. `resolveModel(tier, slot)` is the only resolution path: the orchestrator calls it with `strong`, `runSubagent` with `role.slot`. The **model registry** (`model-registry.ts`, server-only) holds `ModelEntry { id, provider, providerModelId, providerOptions?, displayName }`; each entry's rate card is its row in `pricing.ts` `RATES: Record<ModelEntryId, ModelRate>`, so a missing rate fails typecheck and the rate card never enters a client bundle. "The registry" in this document means both together. Provider instances come from a factory per `ProviderId` in `models.ts` (only `google-vertex` now); an entry naming an uninstalled provider fails typecheck. Reasoning effort and other per-call options live in `providerOptions`, so the same provider model at a different effort is a different entry with its own id and rate card (convention: `<model>@<effort>`). Entry ids are opaque stable strings; the three initial ids equal today's `GameModelId` values so existing `turn_usage.model_id` rows and the legacy mapping stay trivially valid. The client-safe `model-catalog.ts` keeps only tier ids, labels, taglines, `DEFAULT_TIER_ID = "balanced"` and the legacy id → tier map. Swapping the model behind a slot, or the provider, edits only the registry and `TIER_PROFILES`. | Provider-suffix naming (ids like `…-vertex`, or roles branching on `flash`/`pro` substrings): couples roles, prompts and billing to vendor names. One model per tier (every role runs the pick): no cheap explorer, no strong planner, and the cost of a phased turn stops being predictable. The player picks raw models (today): exposes vendor churn to the player and forces every role to be re-tuned per model. Rates stored on the entry object in a shared module: puts the rate card one import away from the browser. Keying pricing by tier or slot: a profile edit would re-price history. |
| 19 | Slot fallbacks | A slot maps to an **ordered, non-empty list** of registry entries: the first is the primary, the rest are fallbacks. Authoring rule, stated in `model-registry.ts`: a fallback must be a peer of the same tier and slot (similar capability and price class), never a silent downgrade to a lower slot. `resolveModel(tier, slot)` returns a composite `LanguageModel` that tries candidates in order, applying each candidate's own `providerOptions`. It falls back **only** when a call fails **before any output part is emitted**, **only** on availability errors (`APICallError` with `isRetryable`, HTTP 404 model-not-found, 429, 5xx, network or connect timeout) and only **after** the SDK's own `maxRetries` on that candidate. It never falls back on content or validation errors (400, safety block, schema), on an abort, or mid-stream (that would duplicate output and tokens). A candidate that failed with an availability error is skipped for the rest of the turn (`turnState.unavailable`), so later steps pay no repeated latency. The composite reports the entry that served each call to turn state; usage is attributed to the **serving** entry, and the breakdown records `fallbackFrom` when it was not the primary. If every candidate fails, the last error propagates: a sub-agent run becomes an `error` envelope; the orchestrator turn fails as it does today. | AI Gateway model fallbacks: would move the app onto the gateway provider — a valid later option, not needed to ship the shape. `customProvider`'s `fallbackProvider`: only covers unknown model ids, not runtime failures (`ai/docs/07-reference/01-ai-sdk-core/42-custom-provider.mdx:135`). Retrying at the dispatch-tool level: re-runs side-effecting tool calls. Falling back to a lower slot automatically: silently gives the player less than the tier they chose. |

### Tier profiles (initial population)

| Tier | `strong` | `mid` | `light` |
|---|---|---|---|
| `pro` | `gemini-3.1-pro-preview` | `gemini-3.8-flash` | `gemini-3.5-flash-lite` |
| `balanced` (default) | `gemini-3.8-flash` | `gemini-3.8-flash` | `gemini-3.5-flash-lite` |
| `fast` | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` |

Only the three existing Gemini models on the installed Vertex provider (`@ai-sdk/google-vertex`, `models.ts:1`) are populated. No entry sets `providerOptions` yet. Adding Anthropic, OpenAI or other providers is out of scope: each needs its provider package and verified rates.

Why these profiles:
- **Invariant: each tier's `strong` entry equals the legacy model that maps to it** (`gemini-3.1-pro-preview` → `pro`, `gemini-3.8-flash` → `balanced`, `gemini-3.5-flash-lite` → `fast`). After unit 1a, every existing thread's orchestrator runs the same concrete model it ran before, so unit 1a changes no billed model for the orchestrator.
- Profiles are monotone: no slot of a lower tier is stronger than the same slot of a higher tier.
- `balanced.strong` is not pro because the orchestrator runs `strong` on every turn, tweaks included. Making it pro would price every default-tier turn at pro.
- Consequences against the previous design: on `balanced` the planner and verifier run `gemini-3.8-flash` instead of a fixed pro and flash; on `fast` every role runs flash-lite. That is the player's budget choice, and `pro` is the way to buy pro planning. With three models the tiers collapse slots; richer profiles arrive with new providers, as a registry-only change.

### Role catalogue

| Role | Display name | Slot | Tools | Steps | Timeout | Instructions |
|---|---|---|---|---|---|---|
| orchestrator | — | `strong` | game tools, ask_player, dispatch, load_skill | 25 | turn | workflow (+routing), runtime, pushed skills, skill index |
| explorer | Scout † | `light` | read_file, list_files | 8 | 120 s | roles/explorer, runtime |
| planner | Architect † | `strong` | read, list, load_skill, submit_plan | 12, or `hasToolCall("submit_plan")` | 300 s | roles/planner, runtime, engine-core, skill index |
| gameplay / visuals / audio | Builder / Artist / Composer † | `mid` / `mid` / `light` | scoped tools, load_skill | 20 | 600 s | roles/worker + focus, runtime, defaults ∪ task skills, inlined design, task |
| verifier | Tester † | `strong` | none | 3 | 90 s (+60 s check) | roles/verifier |

† **Placeholder names.** Final bot names are a later product decision. `displayName` is stable per role and never derived from the model. An `avatar` field is reserved for a later change and is not part of the type yet.

Slot rationale:
- orchestrator `strong`: it routes, does tweaks itself (the common case), and writes every reply, so its quality is the baseline the player sees.
- planner `strong`: one reasoning act whose output every worker follows; a planning error multiplies across tasks.
- verifier `strong`: code already decides the console verdict, but a weak visual judge adds false failures that trigger a wasted fix round. It needs image input, which every current entry accepts (see open questions).
- gameplay / visuals `mid`: they spend most of the turn's tokens following a written design, so volume times rate dominates the cost.
- explorer `light`: read-only summarising.
- audio `light`: small, template-like code; it already ran on flash-lite in the previous design.

Every timeout is `min(role, deadline − now − 60 s)`. The deadline is the turn start plus 3300 s, which stays under `maxDuration: 3600`. When less than 30 s remains, the tool returns `skipped`.

`submit_plan` validates its input: at most 6 tasks, known roles and skills, acyclic `dependsOn`, no `owns` entry under a protected prefix, and disjoint ownership outside dependency chains. It returns `{ error }` so the planner corrects itself inside its own loop. On success it writes `.numa/design.md` first and `.numa/tasks.json` second, so a task list never exists without the design it derives from (satisfies the spec's fixed phase order: design before tasks).

Verify budget: 2 calls per turn, which allows one fix round with `run_tasks` fix tasks. Pre-existing errors are the ones already in `.numa/verify/last.json`. With no baseline, every error counts as caused.

If a sandbox has no Chromium (created before the snapshot), the check fails, or it times out, the result is `status: "unavailable"`, and the prompt must say verification did not run.

### Tier persistence and legacy threads

- The browser sends `clientData = { tier }`. `clientDataSchema` becomes `z.object({ tier: tierIdSchema.optional() }).default({})` (today `{ model: gameModelIdSchema.optional() }`, `trigger/chat.ts:112-114`). A missing tier resolves to `DEFAULT_TIER_ID` through `resolveTier`, the single rule the ledger and the provider both use (replacing `resolveGameModelId`, `lib/ai/agent.ts:25`).
- Message metadata records `{ tier }` instead of `{ model }` (`lib/ai/message-model.ts:20`, `:26`). `withThreadTier` replaces `withThreadModel` (`message-model.ts:69`; called at `trigger/chat.ts:269` and `:366`) and merges, so older messages keep their legacy `model` key.
- `readThreadTier` replaces `readThreadModel` (`message-model.ts:39`). It walks backwards; on each message it takes `tier` if it parses, else a legacy `model` that parses against `legacyModelIdSchema` (the old three-id enum, `model-catalog.ts:28-32`) mapped through `LEGACY_MODEL_TIER`, else continues. The newest record wins. No match reads as `undefined`, and the caller falls back to the default tier (`components/chat/use-game-chat.ts:88-93`).
- The home-screen hand-off moves from `?model=` to `?tier=` (`lib/games/actions.ts:88-89`, `app/(app)/games/[id]/page.tsx:20-28`). A stale `?model=` link is ignored and the thread starts on the default tier. There is no production data; only dev threads carry legacy ids.

## Data Flow: phased turn

```
Player ─▶ orchestrator  (tier T; runs resolveModel(T, strong))
  explore({question})       ─▶ explorer [T.light] ─▶ envelope{summary}
  plan({brief})             ─▶ planner [T.strong] ─submit_plan─▶ write .numa/design.md, tasks.json
                               ◀─ envelope{tasks:[id,role,title,owns,dependsOn,skills]}
  run_tasks({tasks:[t1,t2]})─▶ check disjoint + deps + owns ⊆ tasks.json
                               ├─ worker t1 [T.mid] ─┐ scoped writes; each finish-step → ledger(entry id)
                               └─ worker t2 [T.mid] ─┘ yield records (preliminary) ─▶ UI shimmer entries
                               ◀─ envelope{per task: status, edits, summary}
  verify({})                ─▶ startGameServer → check.py → report + screenshot
                               ─▶ verifier [T.strong] ─▶ envelope{pass|fail|unavailable, findings→owner task}
  [fail] run_tasks(fix) → verify (last allowed)
  reply ─▶ onBeforeTurnComplete: priceTurn → data-turn-credits, revision if edits
```

## File Changes (by work unit)

Unit 1 is split into 1a (model tiers) and 1b (usage accumulator): together they exceed the 400-line budget (1a is estimated at ~300 changed lines, 1b at ~250). No other unit is renumbered. 1b builds on 1a's `ModelEntryId`.

| Unit | File | Action |
|---|---|---|
| 1a | `apps/web/lib/ai/model-registry.ts` | Create (server-only): `Slot`, `ProviderId`, `ModelEntryId`, `ModelEntry`, the three Gemini entries, `TIER_PROFILES`, `resolveModel(tier, slot)`, `resolveTier` |
| 1a | `apps/web/lib/ai/model-catalog.ts` | Modify: `TIERS` (id, label, tagline), `tierIdSchema`, `TierId`, `DEFAULT_TIER_ID`, `isTierId`, `getTier`; the old enum (`:28-32`) survives only as `legacyModelIdSchema` with `LEGACY_MODEL_TIER`; `GAME_MODELS`, `GameModel`, `getGameModel`, `DEFAULT_GAME_MODEL_ID` (`:14-76`) are removed |
| 1a | `apps/web/lib/ai/models.ts` | Modify: provider factory per `ProviderId`; instance cache keyed by `ModelEntryId` (`:20-32`) |
| 1a | `apps/web/lib/ai/agent.ts` | Modify: `resolveTier` replaces `resolveGameModelId` (`:25`); `orchestratorModelSettings(tier)` replaces `gameModelSettings` (`:33`) and returns `{ model, providerOptions }` for `resolveModel(tier, "strong")` |
| 1a | `apps/web/lib/ai/pricing.ts` | Modify: `RATES: Record<ModelEntryId, ModelRate>` (`:60`); `turnCostMicroUsd` and `turnCreditCost` take `modelId: ModelEntryId` (`:155-161`, `:238-244`). Rates unchanged, so `RATE_TABLE_VERSION` is unchanged |
| 1a | `apps/web/lib/ai/message-model.ts` | Modify: `{ tier }` metadata, `readThreadTier` with the legacy fallback, `withThreadTier` |
| 1a | `apps/web/components/model-picker.tsx` | Modify: lists `TIERS` with label and tagline, narrows with `isTierId` (`:20-25`, `:48`, `:74`, `:77`); no model or provider names |
| 1a | `components/chat-composer.tsx`, `components/new-game-composer.tsx`, `components/chat/use-game-chat.ts`, `components/game-chat.tsx`, `components/chat/chat-thread.tsx`, `lib/games/actions.ts`, `app/(app)/games/[id]/page.tsx` | Modify: `GameModelId` props and state become `TierId`; `?tier=` hand-off |
| 1a | `apps/web/lib/ai/message-meta.ts`, `lib/games/usage.ts` | Modify: `modelId: ModelEntryId` (`message-meta.ts:96`, `usage.ts:87`) |
| 1a | `apps/web/trigger/chat.ts` | Modify: `clientDataSchema` carries `tier` (`:112-114`); `withThreadTier` (`:269`, `:366`); the orchestrator's entry id from `resolveModel(resolveTier(tier), "strong")` for credits, meta and the ledger (`:313`, `:367`, `:385`); `orchestratorModelSettings` in `run` (`:408`), with `providerOptions` passed after the `toStreamTextOptions` spread |
| 1b | `apps/web/lib/games/harness/turn-state.ts` | Create: `chat.local` `{turn, deadline, tier, ledger[], verifyCalls}` and `addUsage` |
| 1b | `apps/web/lib/ai/pricing.ts` | Modify: add `priceTurn(tier, entries) → TurnCost` |
| 1b | `apps/web/lib/ai/message-meta.ts`, `lib/games/usage.ts`, `lib/games/turn-credits.ts` | Modify: take `TurnCost`, write the breakdown (payload unchanged) |
| 1b | `packages/db/src/schema.ts` | Modify: add `usageBreakdown jsonb` (nullable), then `pnpm db:push` |
| 1b | `apps/web/trigger/chat.ts` | Modify: `onBoot` init, `onTurnStart` reset (with the tier), hooks use `priceTurn` |
| 1c | `apps/web/lib/ai/fallback-model.ts` | Create: composite `LanguageModel` over `SlotCandidates` (decision 19): availability-error classification, pre-output-only fallback, per-candidate `providerOptions`, `onServed` callback, per-turn skip set |
| 1c | `apps/web/lib/ai/model-registry.ts` | Modify: profiles become `SlotCandidates` lists (one candidate each in the initial Gemini population); `resolveModel` returns the composite |
| 1c | `apps/web/lib/games/harness/turn-state.ts`, `lib/ai/pricing.ts` | Modify: `unavailable` skip set; usage attributed to the serving entry; `fallbackFrom` carried into the breakdown |
| 2 | `lib/games/harness/{roles,run-subagent,envelope,flags}.ts`, `tools/explore.ts`, `lib/games/instructions/roles/explorer.ts` | Create. `roles.ts` declares `slot` and `displayName` per role; `run-subagent.ts` resolves the model with `resolveModel(turnState.tier, role.slot)` and passes the entry's `providerOptions` |
| 2 | `trigger/chat.ts`, `lib/games/tool-parts.ts` | Modify: tools config, `activeTools`, labels |
| 3 | `lib/games/tools.ts` | Modify: export the builders and `resolveGamePath`, reserve `.numa/` for writes |
| 3 | `lib/games/harness/ownership.ts`, `tools/run-tasks.ts` (sequential), `instructions/roles/worker.ts` | Create |
| 3 | `trigger/chat.ts` | Modify: `changedGameFiles` counts `run_tasks` edits |
| 4 | `tools/run-tasks.ts` | Modify: concurrent pool (3) with a pairwise check. Spike notes go in `docs/research/spikes/gemini-parallel.md` |
| 5 | `lib/daytona/game-image.ts`, `apps/web/scripts/build-game-snapshot.ts` | Create: Playwright image and snapshot build |
| 5 | `lib/daytona/utils.ts` | Modify: `createGameSandbox` uses `DAYTONA_GAME_SNAPSHOT` when set |
| 6 | `lib/daytona/verify.ts`, `lib/daytona/verify-script.ts`, `tools/verify.ts`, `instructions/roles/verifier.ts` | Create |
| 7 | `lib/games/skills/{registry,engine-*}.ts`, `tools/load-skill.ts` | Create |
| 7 | `lib/games/instructions/engine.ts` | Delete (split into skills) |
| 7 | `lib/games/instructions/index.ts` | Modify: orchestrator keeps **all** engine skills pushed until unit 8, so the prompt is identical |
| 8 | `tools/plan.ts`, `plan-store.ts`, `instructions/roles/planner.ts` | Create |
| 8 | `instructions/workflow.ts`, `harness/flags.ts`, `lib/games/instructions/index.ts` | Modify: routing rule, turn on by default, orchestrator skills cut to engine-core |
| 9 | `lib/games/harness/records.ts` (client-safe types and zod parse, `collectSubagentRuns`), `run-subagent.ts` | Create/Modify: generator yields and caps; records stamp `displayName`, tier, slot, `modelId`, `modelName` |
| 10 | `components/chat/subagent-entry.tsx` (inline shimmer entry), `subagent-sheet.tsx`, `subagent-run-detail.tsx` | Create |
| 10 | `components/chat/chat-message.tsx`, `chat-thread.tsx`, `components/game-chat.tsx`, `lib/games/tool-parts.ts` | Modify: new `agent` block, header button, sheet state (`open`, `selectedRunId`) lifted so an inline entry can open the Sheet on its run |

## Interfaces / Contracts

```ts
// model-catalog.ts (client-safe)
type TierId = "pro" | "balanced" | "fast"             // tierIdSchema = z.enum([...])
type Tier = { id: TierId; label: string; tagline: string }
const DEFAULT_TIER_ID: TierId = "balanced"
type LegacyModelId = "gemini-3.8-flash" | "gemini-3.1-pro-preview" | "gemini-3.5-flash-lite"
const LEGACY_MODEL_TIER: Record<LegacyModelId, TierId> // pro-preview→pro, 3.8-flash→balanced, flash-lite→fast

// model-registry.ts (server-only)
type Slot = "strong" | "mid" | "light"
type ProviderId = "google-vertex"
type ModelEntryId = "gemini-3.1-pro-preview" | "gemini-3.8-flash" | "gemini-3.5-flash-lite"
type ModelEntry = { id: ModelEntryId; provider: ProviderId; providerModelId: string
  providerOptions?: ProviderOptions /* e.g. reasoning effort; derived from streamText's param type */
  displayName: string }
type SlotCandidates = readonly [ModelEntryId, ...ModelEntryId[]] // primary first, then peer fallbacks
type TierProfile = Record<Slot, SlotCandidates>
const TIER_PROFILES: Record<TierId, TierProfile>
type ResolvedModel = { candidates: SlotCandidates; primary: ModelEntry
  model: LanguageModel /* composite: tries candidates in order (decision 19) */ }
type ServedCall = { entryId: ModelEntryId; fallbackFrom?: ModelEntryId } // reported to turn state per call
function resolveTier(id: TierId | undefined): TierId
function resolveModel(tier: TierId, slot: Slot): ResolvedModel

// harness
type RoleId = "explorer" | "planner" | "gameplay" | "visuals" | "audio" | "verifier"
type RoleDef = { id: RoleId; displayName: string /* placeholder */; slot: Slot
  maxSteps: number; timeoutMs: number } // avatar: reserved, not declared yet
type TaskSpec = { id: string; role: "gameplay" | "visuals" | "audio"; title: string
  goal: string /* goal, procedure, constraints, done-when; ≤ 1200 chars */
  owns: string[]; dependsOn: string[]; skills: SkillName[] }
type EnvelopeStatus = "done" | "partial" | "blocked" | "error" | "aborted" | "skipped" | "unavailable"
type SubagentEnvelope = { agent: string; status: EnvelopeStatus; summary: string
  edits?: string[]; artifacts?: string[]; findings?: Finding[] }
type AgentUsageEntry = { agentId: string; role: RoleId | "orchestrator"; slot: Slot
  modelId: ModelEntryId /* the concrete registry entry that SERVED the call */
  fallbackFrom?: ModelEntryId /* set when a fallback served instead of the primary */
  usage: LanguageModelUsage; status: EnvelopeStatus }
type TurnCost = { tier: TierId; tokens: Tokens; costMicroUsd: number; credits: number
  breakdown: (Omit<AgentUsageEntry, "usage"> & Tokens & { costMicroUsd: number })[] }
// records.ts (client-safe): SubagentRunRecord carries modelId and modelName as plain strings
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Static | Every unit; a tier profile or entry without a rate card, or an entry with an unknown provider, fails typecheck | `turbo typecheck` and `turbo lint` (no test runner, strict TDD off) |
| Manual | Credits equal the sum of every run; an owned-file violation is rejected; a seeded JS error fails verify; a stop mid-worker still bills its completed steps | Dev with `HARNESS_PHASES=on`, reading the `turn_usage` row and its breakdown |
| Manual (1a) | Each tier's orchestrator entry appears in `turn_usage.model_id`; a dev thread stamped with a legacy model id reloads to the mapped tier; editing only `TIER_PROFILES` changes the entry a role runs on | Dev, switching tiers in the picker and reloading |
| Spikes | Parallel calls on Vertex; the Chromium image | Go/no-go below |

Chromium spike go/no-go: snapshot ≤ 2.5 GiB and builds; sandbox from the snapshot starts ≤ 5 s slower than today; check p50 ≤ 15 s and p95 ≤ 30 s on a Three.js game; a non-blank SwiftShader screenshot; a seeded `pageerror` is caught; the check runs in 1 GiB RAM (or ≤ 2 GiB with the cost accepted). If it fails any of these, unit 6 ships with `unavailable` only.

## Threat Matrix

| Boundary | Applicability |
|---|---|
| Documentation-like paths, Git repository selection, commit state, push state, PR commands | N/A: no git, VCS or PR automation, and no executable-file classification. |

Note: `verify` runs one fixed command in the game's Daytona sandbox. Its arguments are constants, it interpolates no model or player text, the script is uploaded from a repo constant outside `GAME_DIR`, and the output is parsed JSON capped at 20 errors of 300 chars each.

Note: the tier crosses from the browser and is validated against the closed `tierIdSchema`; the browser can never name a registry entry, provider or provider option.

## Migration / Rollout

- The only schema change adds one nullable column, through `pnpm db:push`. There are no migration files. Tiers add no column: `turn_usage.model_id` stays `text` and now holds the orchestrator's registry entry id, which for the three initial entries is the same string as before.
- `HARNESS_PHASES` (off until unit 8) and `DAYTONA_GAME_SNAPSHOT` (off until the unit 5 spike passes) gate the rollout. Tiers are not flagged: the invariant in the tier profiles keeps each thread's orchestrator on its previous model.
- Each unit is revertible on its own. Dispatch tools stay declared on the config, so old threads re-convert correctly.

## Deviations from the proposal (explicit)

1. `.numa/` becomes a reserved write prefix for the orchestrator's own tools too, not only the scoped variant.
2. Verification only covers sandboxes created from the new snapshot. Older games report `unavailable`.
3. `engine/` and `vendor/` write protection moves from prompt-only to code, for the orchestrator's tools as well as the scoped ones (decision 11). Added after the design validation pass found the spec's "Engine and Vendor Protections Preserved" requirement had no enforcing mechanism.
4. The carried constraint in `explore.md` ("model tier per role from the catalog (3.1-pro-preview, 3.8-flash, 3.5-flash-lite)") is superseded by Amendment 2: roles bind to slots, and model ids live only in the registry.

## Pre-existing issue found during design review

`pricing.ts:111-115` gives `gemini-3.5-flash-lite` a `cachedInput` rate (0.20) higher than its `input` rate (0.10), so a cached read would bill more than a fresh one. Fix it together with confirming the real flash-lite rates, before unit 2 ships.

## Amendment 2 (2026-09-11): provider-agnostic model tiers

Confirmed by the user; binding.
- The player picks a tier (`pro`, `balanced`, `fast`), not a model. The picker shows tiers only.
- Roles bind to slots (`strong`, `mid`, `light`); `resolveModel(tier, slot)` is the only path to a concrete model. The role catalogue's Model column became Slot; the orchestrator is `strong` instead of "player pick" (decisions 1, 2, 13).
- New decision 18: a numa-owned model registry (entry id, provider, provider model id, optional provider options including reasoning effort, display name, rate card in `pricing.ts` keyed by entry id) plus tier profiles. A provider or model swap edits only these. Initial population: the three Gemini models on Vertex; other providers are out of scope.
- Pricing, the ledger and the breakdown name the concrete entry that ran; the breakdown also records the tier (decisions 9, 10; `AgentUsageEntry.modelId: ModelEntryId`).
- The thread persists the tier; legacy Gemini model ids map deterministically to tiers.
- Sub-agent view: inline shimmer entry per run that opens the Sheet focused on it; runs presented as named bots with placeholder `displayName`s; concrete model shown in the run detail (decisions 15, 16).
- Unit 1 split into 1a (tiers) and 1b (accumulator). The planner step-down question is resolved.

## Amendment 3 (2026-09-11): slot fallbacks

Confirmed by the user; binding.
- A slot holds an ordered list of peer candidates (same tier and slot, similar capability), not a single entry (decision 19).
- Fallback happens only before any output, only on availability errors, only after the SDK's own retries; never mid-stream, never on content errors or aborts, never to a lower slot.
- Billing follows the entry that served each call; the breakdown records `fallbackFrom`.
- Ships as unit 1c (after 1b, because it attributes usage in the ledger). The initial Gemini profiles hold one candidate per slot, so fallback is exercised in dev by pointing a primary at an unavailable provider model id. Richer peer lists arrive with new providers.
- Implementation must confirm against the installed `@ai-sdk/provider` spec that per-call `providerOptions` reach the wrapped model's `doGenerate`/`doStream` options, so each candidate can apply its own.

## Open Questions

- [ ] The `gemini-3.5-flash-lite` rate is an UNVERIFIED placeholder. The explorer and audio roles bill at it on every tier, and the whole `fast` tier runs on it (players can already pick flash-lite today, so unit 1a adds no new exposure), so it must be confirmed before unit 2 ships.
- [x] ~~Should the planner step down from pro when the player picked flash-lite?~~ Resolved by Amendment 2: the planner runs the tier's `strong` slot, so on `fast` it runs `fast.strong` by the player's budget choice, and `pro` is the way to buy pro planning.
- [ ] The long-context tier is still decided on the aggregated input of a run, not per request. This is pre-existing and becomes more visible on pro.
- [ ] Which TS runner the snapshot build script uses (none is confirmed in the repo).
- [ ] Final tier labels and taglines, and final bot names and avatars (product/UI decisions; placeholders ship until then).
- [ ] The verifier needs image input. Every current entry accepts images; if a future registry entry without image input is placed in a `strong` slot, roles will need a declared capability check against the resolved entry.
- [ ] Whether the per-message turn details should also show the orchestrator's concrete model (today only sub-agent runs show theirs, in the Sheet).
