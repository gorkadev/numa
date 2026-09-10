# Tasks: Multi-agent game-building harness

Strict TDD is disabled (no test runner). Every unit's Focused test command is
`pnpm turbo typecheck --filter=web` (+ `--filter=@workspace/db` where the schema
changes) plus `pnpm turbo lint --filter=web`. Runtime harness is a manual dev
scenario run against `trigger dev` + the app, or an explicit `N/A` with reason.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3200–3800 total across 15 slices |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 1a → 1b → 1c → 2a → 2b → 3 → 4 → 5 → 6 → 7a → 7b → 8 → 9 → 10a → 10b |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (chosen by the user, 2026-09-11) |

Decision needed before apply: No (resolved: chained PRs, stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Units 2, 7 and 10 are split beyond the proposal's numbering (2a/2b, 7a/7b,
10a/10b) because each plausibly exceeds 400 lines on its own: unit 2 mixes a
new streaming runner with a first tool wiring; unit 7 moves `engine.ts`'s full
body into 8 typed skill files; unit 10 adds three new components and rewires
four existing ones. Splitting keeps each slice reviewable and independently
revertible.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1a | Tiers, registry, `resolveModel`, picker | PR 1 | `pnpm turbo typecheck --filter=web && pnpm turbo lint --filter=web` | Switch tiers in the picker on a dev thread; reload; check `turn_usage.model_id` | Revert 1a files; a legacy `model` record still resolves via `LEGACY_MODEL_TIER` |
| 1b | Usage accumulator (`chat.local`, `priceTurn`) | PR 2 | same + `--filter=@workspace/db` | Run one turn, read `turn_usage.usage_breakdown` | Revert 1b; `usageBreakdown` stays nullable, no behavior depends on it yet |
| 1c | Slot fallbacks (composite model) | PR 3 | same as 1a | Point a `fast` primary at an invalid provider model id in dev, run a turn, confirm the peer serves and bills | Revert `fallback-model.ts` and the `SlotCandidates`-length-1 lists; single-candidate behavior is unchanged |
| 2a | Harness core: roles, envelope, flags, `run-subagent` runner | PR 4 | same as 1a | N/A — no tool wired to the orchestrator yet, runner unit is inert until 2b | Revert `harness/{roles,run-subagent,envelope,flags}.ts`; no other unit's code path calls them yet |
| 2b | Explorer sub-agent wired to `chat.agent` | PR 5 | same as 1a | `HARNESS_PHASES` stays off; call `explore` behind a temp flag/log in dev, confirm ledger entry and reply text | Revert `tools/explore.ts`, `instructions/roles/explorer.ts`, and the `trigger/chat.ts`/`tool-parts.ts` wiring diff |
| 3 | File ownership + sequential worker | PR 6 | same as 1a | Dispatch one worker task in dev, then a second targeting an unowned path, confirm rejection | Revert `harness/ownership.ts`, `tools/run-tasks.ts`, `instructions/roles/worker.ts`; explorer path unaffected |
| 4 | Parallel dispatch (gated by spike) | PR 7 | same as 1a | Two disjoint-ownership tasks in dev; confirm concurrent completion and correct billing | Revert the concurrency pool in `tools/run-tasks.ts`; sequential path from unit 3 still works |
| 5 | Chromium snapshot (gated by spike) | PR 8 | same as 1a | `DAYTONA_GAME_SNAPSHOT` on in dev; boot a sandbox from the new snapshot, confirm start-time delta | Revert `lib/daytona/game-image.ts`, `scripts/build-game-snapshot.ts`, unset `DAYTONA_GAME_SNAPSHOT` |
| 6 | Verify role | PR 9 | same as 1a | Seed a `pageerror` in a dev game, run `verify`, confirm turn-caused categorization and one retry | Revert `lib/daytona/{verify,verify-script}.ts`, `tools/verify.ts`, `instructions/roles/verifier.ts` |
| 7a | Skills registry + 8 skill files | PR 10 | same as 1a | N/A — no role instructions read the registry yet | Revert `lib/games/skills/*`; `instructions/engine.ts` still exists and is still used |
| 7b | `loadSkill` tool + role defaults wiring | PR 11 | same as 1a | Dispatch a worker in dev with a task-only skill, confirm it appears in instructions; call `loadSkill` for an unknown name | Revert `tools/load-skill.ts` and the `instructions/index.ts` push wiring; falls back to `engine.ts` |
| 8 | Size routing + phase flow (flag on) | PR 12 | same as 1a | `HARNESS_PHASES=on` in dev: a "make me a game" message asks ≤2 questions; a named-game message builds phased | Set `HARNESS_PHASES` back to off; single-loop path is unchanged code |
| 9 | Sub-agent run records | PR 13 | same as 1a | Run a phased turn in dev, inspect the persisted `games.messages` tool-output record shape | Revert `harness/records.ts`; `run-subagent.ts` stops stamping the extra fields |
| 10a | Sub-agent view components | PR 14 | same as 1a | N/A — components unrendered until 10b wires them | Revert the three new `components/chat/*` files |
| 10b | Sub-agent view wiring (header, inline entry, reload) | PR 15 | same as 1a | Run a phased turn in dev, watch the inline shimmer entry, open the Sheet mid-run and after reload | Revert the wiring diff in `chat-message.tsx`, `chat-thread.tsx`, `game-chat.tsx`, `tool-parts.ts`; header button and inline entries disappear, no data loss |

Sequencing is linear: 1a → 1b → 1c → 2a → 2b → 3 → 4 → 5 → 6 → 7a → 7b → 8 → 9 →
10a → 10b. Within 1a, the `model-catalog.ts`/`model-registry.ts` pair and the
UI-caller sweep (`chat-composer.tsx`, `new-game-composer.tsx`, etc.) can be
authored in parallel once `TierId` exists, then committed together. Within 10a,
the three components have no cross-dependency and can be authored in parallel.

## Unit 1a — Model tiers, registry, `resolveModel`, picker

Satisfies `model-tiers`: Player Selects a Tier, Tier Profiles Map Three Slots,
Roles Resolve Models Only Through Slots, Model Registry Owns Every Concrete
Model, Swapping a Slot's Model Touches Only the Registry, Reasoning Effort Is a
Registry Property, Usage Priced by the Concrete Entry, Per-Thread Tier
Persistence With Legacy Mapping, Picker Shows Tiers, Initial Registry
Population; `agent-orchestration`: Orchestrator Runs the Tier's Strong Slot.

- [x] 1a.1 Create `apps/web/lib/ai/model-registry.ts`: `Slot`, `ProviderId`,
      `ModelEntryId`, `ModelEntry`, the three Gemini entries, `TIER_PROFILES`
      (one candidate per slot for now), `resolveModel(tier, slot)`, `resolveTier`.
- [x] 1a.2 Modify `apps/web/lib/ai/model-catalog.ts`: add `TIERS`,
      `tierIdSchema`, `TierId`, `DEFAULT_TIER_ID = "balanced"`, `isTierId`,
      `getTier`; keep the old enum only as `legacyModelIdSchema` +
      `LEGACY_MODEL_TIER`; remove `GAME_MODELS`/`GameModel`/`getGameModel`/
      `DEFAULT_GAME_MODEL_ID`.
- [x] 1a.3 Modify `apps/web/lib/ai/models.ts`: provider factory per
      `ProviderId`, instance cache keyed by `ModelEntryId`.
- [x] 1a.4 Modify `apps/web/lib/ai/agent.ts`: `resolveTier` replaces
      `resolveGameModelId`; `orchestratorModelSettings(tier)` returns
      `{ model, providerOptions }` for `resolveModel(tier, "strong")`.
- [x] 1a.5 Modify `apps/web/lib/ai/pricing.ts`: `RATES: Record<ModelEntryId,
      ModelRate>`; `turnCostMicroUsd`/`turnCreditCost` take
      `modelId: ModelEntryId`. Rates unchanged here; `RATE_TABLE_VERSION`
      unchanged.
- [x] 1a.6 Modify `apps/web/lib/ai/message-model.ts`: `{ tier }` metadata,
      `readThreadTier` (walks backwards, legacy `model` → `LEGACY_MODEL_TIER`,
      newest record wins, no match → `undefined`), `withThreadTier`.
- [x] 1a.7 Modify `apps/web/components/model-picker.tsx`: list `TIERS` with
      label + tagline, narrow with `isTierId`; no model/provider names.
- [x] 1a.8 Modify `apps/web/components/chat-composer.tsx`,
      `new-game-composer.tsx`, `components/chat/use-game-chat.ts`,
      `components/game-chat.tsx`, `components/chat/chat-thread.tsx`,
      `lib/games/actions.ts`, `app/(app)/games/[id]/page.tsx`: `GameModelId`
      props/state → `TierId`; hand-off moves from `?model=` to `?tier=`.
- [x] 1a.9 Modify `apps/web/lib/ai/message-meta.ts`, `lib/games/usage.ts`:
      `modelId: ModelEntryId`.
- [x] 1a.10 Modify `apps/web/trigger/chat.ts`: `clientDataSchema` carries
      `{ tier: tierIdSchema.optional() }.default({})`; `withThreadTier` calls;
      resolve the orchestrator's entry id via `resolveModel(resolveTier(tier),
      "strong")` for credits/meta/ledger; `orchestratorModelSettings` in
      `run`, `providerOptions` passed after the `toStreamTextOptions` spread.

## Unit 1b — Usage accumulator

Satisfies `turn-usage-accounting`: Per-Model Pricing, Full-Turn Summation,
Failed/Aborted Usage Still Counts, Credits Chunk Reflects Full Turn, Persisted
Metadata Reflects Full Turn, Ledger and Polar Reflect Full Turn, Exactly One
Polar Event, Per-Sub-Agent Breakdown Retained.

- [ ] 1b.1 Create `apps/web/lib/games/harness/turn-state.ts`: `chat.local`
      shape `{ turn, deadline, tier, ledger: AgentUsageEntry[], verifyCalls }`
      and `addUsage(entry)`.
- [ ] 1b.2 Modify `apps/web/lib/ai/pricing.ts`: add `priceTurn(tier, entries)
      → TurnCost` summing all priced entries into one total.
- [ ] 1b.3 Modify `apps/web/lib/ai/message-meta.ts`, `lib/games/usage.ts`,
      `lib/games/turn-credits.ts`: accept `TurnCost`, write the breakdown
      (`data-turn-credits` payload shape unchanged, one Polar event per turn).
- [ ] 1b.4 Modify `packages/db/src/schema.ts`: add nullable `usageBreakdown
      jsonb` to `turnUsage` (next to `costMicroUsd` at :188); run `pnpm
      db:push` (never `drizzle-kit generate`/`migrate`).
- [ ] 1b.5 Modify `apps/web/trigger/chat.ts`: `onBoot` inits `chat.local`,
      `onTurnStart` resets it with `(turn, deadline, tier)`; completion hooks
      call `priceTurn` instead of pricing the orchestrator's usage alone.

## Unit 1c — Slot fallbacks

Gate: confirm against the installed `@ai-sdk/provider` types that per-call
`providerOptions` reach the wrapped model's `doGenerate`/`doStream` options,
before writing the composite model (Amendment 3).

- [ ] 1c.0 (GATE) Trace `providerOptions` from `streamText`/`ToolLoopAgent`
      through `LanguageModelV2.doGenerate`/`doStream` in the installed
      `@ai-sdk/provider`/`@ai-sdk/provider-utils` sources; record the finding
      as a one-paragraph note at the top of `fallback-model.ts`.

Satisfies `model-tiers`: Slot Fallback on Availability Failure.

- [ ] 1c.1 Create `apps/web/lib/ai/fallback-model.ts`: composite
      `LanguageModel` over `SlotCandidates`; classify availability errors
      (`APICallError.isRetryable`, 404/429/5xx, network/connect timeout);
      fall back only pre-output and only after the SDK's own `maxRetries`;
      never on content/validation errors or abort; `onServed` callback.
- [ ] 1c.2 Modify `apps/web/lib/ai/model-registry.ts`: `resolveModel` returns
      the composite; profiles keep one candidate per slot for now (fallback is
      exercised in dev by pointing a primary at an invalid model id).
- [ ] 1c.3 Modify `apps/web/lib/games/harness/turn-state.ts`,
      `lib/ai/pricing.ts`: per-turn `unavailable` skip set; usage attributed
      to the serving entry; `fallbackFrom` carried into the breakdown.

## Unit 2a — Harness core (runner, roles, envelope, flags)

- [ ] 2a.0 (GATE) Confirm the real `gemini-3.5-flash-lite` rate (Vertex
      pricing page or a bill), fix `apps/web/lib/ai/pricing.ts:111-115` so
      `cachedInput` (currently 0.20) never exceeds `input` (currently 0.10),
      and bump `RATE_TABLE_VERSION`. Must land before any unit-2 task ships,
      per the pre-existing-issue note in design.md; unit 1a explicitly leaves
      rates unchanged, so this fix is not folded into 1a/1b.

Satisfies `agent-orchestration`: Fixed Roles Per Phase, Named Bot Identity Per
Role, Workers Never Delegate, `ask_player` Stays With the Orchestrator,
Sub-Agent Failures Return as a Result, Abort Propagation, Compact Result
Envelope.

- [ ] 2a.1 Create `apps/web/lib/games/harness/roles.ts`: `RoleDef` (`id`,
      `displayName`, `slot`, `maxSteps`, `timeoutMs`) for every role in the
      catalogue; no role names a model/provider.
- [ ] 2a.2 Create `apps/web/lib/games/harness/envelope.ts`:
      `EnvelopeStatus`, `SubagentEnvelope`, `AgentUsageEntry`.
- [ ] 2a.3 Create `apps/web/lib/games/harness/flags.ts`: `HARNESS_PHASES`
      (default off).
- [ ] 2a.4 Create `apps/web/lib/games/harness/run-subagent.ts`: resolves
      `resolveModel(turnState.tier, role.slot)`, forwards the abort signal,
      applies `min(role.timeoutMs, deadline − now − 60s)`, consumes
      `fullStream` throttled to 500 ms into compact preliminary records, calls
      `turnState.addUsage` on every `onStepEnd`, returns `{ envelope,
      records }`.

## Unit 2b — Explorer sub-agent

Satisfies `agent-orchestration`: Role dispatch carries fixed parameters
(explorer scenario); wires 2a into `chat.agent` for the first time.

- [ ] 2b.1 Create `apps/web/lib/games/harness/tools/explore.ts`: dispatch
      tool running the explorer role (`read_file`, `list_files`, 8 steps,
      120 s), returns `toModelOutput({ output: envelope })`.
- [ ] 2b.2 Create `apps/web/lib/games/instructions/roles/explorer.ts`.
- [ ] 2b.3 Modify `apps/web/trigger/chat.ts`: declare the `explore` tool on
      `chat.agent({ tools })`, narrowed by `activeTools` behind
      `HARNESS_PHASES` (still off).
- [ ] 2b.4 Modify `apps/web/lib/games/tool-parts.ts`: add the `explore` tool
      part label/shape for existing tool-group rendering.

## Unit 3 — File ownership + sequential worker

Satisfies `file-ownership`: Declared Ownership Per Task, Out-of-Scope Writes
Rejected, Engine/Vendor Protections Preserved, `index.html` Cannot Be Deleted,
Parallel Dispatch Requires Disjoint Ownership (sequential half);
`agent-orchestration`: Parallel Dispatch Only on Disjoint Ownership
(sequential half).

- [ ] 3.1 Modify `apps/web/lib/games/tools.ts`: export the tool builders and
      `resolveGamePath`; reserve `.numa/` for writes (protected-prefix guard
      now covers `engine/`, `vendor/`, `.numa/` in code, for every write tool
      including the orchestrator's own, per design decision 11/Deviation 1&3).
- [ ] 3.2 Create `apps/web/lib/games/harness/ownership.ts`:
      `createScopedGameTools(gameId, owns)`; write/replace/delete tools check
      the protected-prefix guard, then `isOwned`; violation returns `{ error }`
      naming the failed check; `index.html` delete stays rejected regardless
      of ownership.
- [ ] 3.3 Create `apps/web/lib/games/harness/tools/run-tasks.ts` (sequential
      only): runs one `TaskSpec` at a time through a `gameplay`/`visuals`/
      `audio` worker with scoped tools.
- [ ] 3.4 Create `apps/web/lib/games/instructions/roles/worker.ts`
      (shared) + per-focus prompt sections.
- [ ] 3.5 Modify `apps/web/trigger/chat.ts`: `changedGameFiles` counts
      `run_tasks` edits.

## Unit 4 — Parallel dispatch (gated)

- [ ] 4.0 (GATE) Spike: run concurrent Gemini-on-Vertex calls from
      `ToolLoopAgent`s in dev; record findings (works / needs serialization)
      in `docs/research/spikes/gemini-parallel.md`.

Satisfies `agent-orchestration`: Parallel Dispatch Only on Disjoint Ownership
(concurrent half); `file-ownership`: Parallel Dispatch Requires Disjoint
Ownership (concurrent half).

- [ ] 4.1 Modify `apps/web/lib/games/harness/tools/run-tasks.ts`: concurrency
      pool (cap 3, batch ≤ 4), pairwise ownership-overlap + `dependsOn`
      check before dispatch, `Promise.all`-style wait so correctness never
      depends on the model emitting parallel calls.

## Unit 5 — Chromium snapshot (gated)

- [ ] 5.0 (GATE) Spike against the design's go/no-go: snapshot ≤ 2.5 GiB and
      builds; sandbox start ≤ 5 s slower than today; check p50 ≤ 15 s / p95 ≤
      30 s on a Three.js game; non-blank SwiftShader screenshot; a seeded
      `pageerror` is caught; 1 GiB RAM (or ≤ 2 GiB, cost accepted). Record the
      result in `docs/research/spikes/chromium-snapshot.md`. If any criterion
      fails, unit 6 ships `unavailable`-only and `DAYTONA_GAME_SNAPSHOT` stays
      off.

Satisfies `game-verification`: Behavior When the Verifier Is Unavailable
(sandbox-provisioning half).

- [ ] 5.1 Create `apps/web/lib/daytona/game-image.ts`: Playwright image
      definition (`Image.base().runCommands()`).
- [ ] 5.2 Create `apps/web/scripts/build-game-snapshot.ts`:
      `snapshot.create({ image })` build script.
- [ ] 5.3 Modify `apps/web/lib/daytona/utils.ts`: `createGameSandbox` uses
      `DAYTONA_GAME_SNAPSHOT` when the spike passed and the env var is set;
      falls back to today's sandbox otherwise.

## Unit 6 — Verify role

Depends on unit 5's spike passing (or ships `unavailable`-only per 5.0).
Satisfies `game-verification`: Verify Runs in Headless Chromium, Distinguish
Turn-Caused vs Pre-Existing Errors, One Corrective Retry, Honest Reporting
After Retry, Never Claim Success Without Running Verify, Behavior When the
Verifier Is Unavailable.

- [ ] 6.1 Create `apps/web/lib/daytona/verify-script.ts`: the fixed Python
      Playwright script (constants only, no interpolated model/player text),
      uploaded from a repo constant outside `GAME_DIR`; parses console errors
      (cap 20 × 300 chars) and diffs against `.numa/verify/last.json`.
- [ ] 6.2 Create `apps/web/lib/daytona/verify.ts`: runs the script via
      `process.executeCommand`, returns `{ status: "pass" | "fail" |
      "unavailable", findings }`.
- [ ] 6.3 Create `apps/web/lib/games/harness/tools/verify.ts`: dispatch tool
      (verifier role, `strong` slot, no tools, 3 steps, 90 s + 60 s check
      budget, 2 calls/turn cap); on `fail`, the orchestrator gets exactly one
      corrective `run_tasks` pass before the next `verify` call is refused.
- [ ] 6.4 Create `apps/web/lib/games/instructions/roles/verifier.ts`: model
      may only add visual findings, never clear a code-decided console
      verdict.

## Unit 7a — Skills registry + skill files

Satisfies `agent-skills`: Registry Entry Shape, Deterministic Role Defaults
(data half).

- [ ] 7a.1 Create `apps/web/lib/games/skills/registry.ts`: `SkillName` union,
      `Skill { name, description, trigger, body }`, role-default map.
- [ ] 7a.2 Create `apps/web/lib/games/skills/engine-*.ts` (8 files): split
      the body of `apps/web/lib/games/instructions/engine.ts` into 8 typed
      skills with no content loss (move, not rewrite).

## Unit 7b — `loadSkill` tool + wiring

Satisfies `agent-skills`: Orchestrator-Selected Extra Skills, `loadSkill`
Fallback With Capped/Truncated Output, Unknown Skill Name Returns an Error, No
Shell Execution Exposed.

- [ ] 7b.1 Create `apps/web/lib/games/harness/tools/load-skill.ts`: ≤ 6k-char
      cap with truncation marker; unknown name → `{ error }` listing valid
      names; no fs, no `bash` or shell-execution tool anywhere in this path.
- [ ] 7b.2 Delete `apps/web/lib/games/instructions/engine.ts`.
- [ ] 7b.3 Modify `apps/web/lib/games/instructions/index.ts`: orchestrator
      keeps **all** engine skills pushed (prompt stays identical) until unit
      8; workers get role defaults ∪ `TaskSpec.skills`.

## Unit 8 — Size routing + phase flow

Satisfies `agent-orchestration`: Size Routing, Fixed Phase Order, Question
Behavior Based on Message Specificity; `file-ownership`: Engine/Vendor
Protections Preserved (plan half, decision 12).

- [ ] 8.1 Create `apps/web/lib/games/harness/tools/plan.ts` +
      `plan-store.ts`: `submit_plan` validates ≤ 6 tasks, known roles/skills,
      acyclic `dependsOn`, no `owns` entry under `engine/`/`vendor/`/`.numa/`,
      disjoint ownership outside dependency chains; on success writes
      `.numa/design.md` then `.numa/tasks.json` (design before tasks).
- [ ] 8.2 Create `apps/web/lib/games/instructions/roles/planner.ts`.
- [ ] 8.3 Modify `apps/web/lib/games/instructions/workflow.ts`: routing rule
      (tweak vs phased) plus WHEN TO USE / WHEN NOT TO USE on `plan`.
- [ ] 8.4 Modify `apps/web/lib/games/harness/flags.ts`: `HARNESS_PHASES`
      turned on by default.
- [ ] 8.5 Modify `apps/web/lib/games/instructions/index.ts`: orchestrator
      skills cut down to engine-core (routing now lives in the workflow
      prompt, not full engine instructions).

## Unit 9 — Sub-agent run records

Satisfies `subagent-view`: Sub-Agent Run Record Fields.

- [ ] 9.1 Create `apps/web/lib/games/harness/records.ts`: client-safe
      `SubagentRunRecord` type + zod parse, `collectSubagentRuns`.
- [ ] 9.2 Modify `apps/web/lib/games/harness/run-subagent.ts`: generator
      yields stamp `agentId`, role, `displayName`, tier, slot, `modelId`,
      `modelName`, steps, tool calls (name, path, ok, ≤200-char error), edits,
      tokens, skills, summary — captured even on failure/abort, capped.

## Unit 10a — Sub-agent view components

Satisfies `subagent-view`: Named Bots (component half).

- [ ] 10a.1 Create `apps/web/components/chat/subagent-entry.tsx`: inline
      `displayName · current activity`, shimmer class while running, plain
      status text when finished, `onClick` opens the Sheet on this run.
- [ ] 10a.2 Create `apps/web/components/chat/subagent-sheet.tsx`: right
      `Sheet` (`@workspace/ui/components/sheet`) listing thread runs by
      `displayName` (role secondary), `selectedRunId` prop.
- [ ] 10a.3 Create `apps/web/components/chat/subagent-run-detail.tsx`: full
      detail (role, `displayName`, `modelName`, tier, slot, tool calls, edits,
      tokens, status); live-updates while the run is in progress.

## Unit 10b — Sub-agent view wiring

Satisfies `subagent-view`: Inline Entry Shimmers While Running, Sub-Agent Runs
Are Openable From the Thread, Sub-Agents Are Presented as Named Bots (wiring
half), Sub-Agent Records Survive Reload.

- [ ] 10b.1 Modify `apps/web/components/chat/chat-message.tsx`: render a new
      `agent` tool-part block using `subagent-entry.tsx` per run.
- [ ] 10b.2 Modify `apps/web/components/chat/chat-thread.tsx`,
      `components/game-chat.tsx`: thread-header button; lift `{ open,
      selectedRunId }` state so both the header button and an inline entry can
      open the same Sheet.
- [ ] 10b.3 Modify `apps/web/lib/games/tool-parts.ts`: parse persisted
      `agent` tool-output parts back into `SubagentRunRecord[]` on reload, so
      inline entries and the Sheet show identical detail before and after a
      reload.

## Key Learnings

1. The change is genuinely large (7 capabilities, 15 delivery slices) and its
   task list cannot fit the generic 530-word SDD budget without dropping the
   concrete file paths and gating tasks the orchestrator explicitly required.
2. Units 2, 7 and 10 were split beyond the proposal's own numbering because
   each mixes a structurally new subsystem with its first wiring point, which
   is exactly where line counts jump.
3. All three spikes (Vertex parallel calls, Chromium snapshot, providerOptions
   propagation) are placed as gate tasks inside the unit they open, not as a
   separate research phase, so their pass/fail directly blocks that unit's
   remaining tasks.
4. The threat matrix's single row is N/A for this change (no git/VCS/PR
   automation), so no RED-test tasks were generated from it.
5. `packages/db/src/schema.ts`'s only change is one nullable `usageBreakdown`
   column applied via `pnpm db:push`, consistent with the project's no-migrations
   convention.
