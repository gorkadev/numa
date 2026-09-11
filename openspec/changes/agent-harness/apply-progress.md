# Apply Progress: agent-harness

## Unit 1a — Model tiers, registry, `resolveModel`, picker (PR 1)

Branch: `agent-harness/1a-model-tiers` (stacked-to-main, first slice)

- [x] 1a.1 Create `apps/web/lib/ai/model-registry.ts`
- [x] 1a.2 Modify `apps/web/lib/ai/model-catalog.ts`
- [x] 1a.3 Modify `apps/web/lib/ai/models.ts`
- [x] 1a.4 Modify `apps/web/lib/ai/agent.ts`
- [x] 1a.5 Modify `apps/web/lib/ai/pricing.ts`
- [x] 1a.6 Modify `apps/web/lib/ai/message-model.ts`
- [x] 1a.7 Modify `apps/web/components/model-picker.tsx`
- [x] 1a.8 Modify chat-composer.tsx, new-game-composer.tsx, use-game-chat.ts,
      game-chat.tsx, chat-thread.tsx, lib/games/actions.ts,
      app/(app)/games/[id]/page.tsx
- [x] 1a.9 Modify `apps/web/lib/ai/message-meta.ts`, `lib/games/usage.ts`
- [x] 1a.10 Modify `apps/web/trigger/chat.ts`

10/10 tasks in unit 1a complete. Units 1b–10b remain (`[ ]`), unassigned to
this apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/ai/model-registry.ts` | Created |
| `apps/web/lib/ai/model-catalog.ts` | Modified |
| `apps/web/lib/ai/models.ts` | Modified |
| `apps/web/lib/ai/agent.ts` | Modified |
| `apps/web/lib/ai/pricing.ts` | Modified |
| `apps/web/lib/ai/message-model.ts` | Modified |
| `apps/web/lib/ai/message-meta.ts` | Modified |
| `apps/web/lib/games/usage.ts` | Modified |
| `apps/web/components/model-picker.tsx` | Modified |
| `apps/web/components/chat-composer.tsx` | Modified |
| `apps/web/components/new-game-composer.tsx` | Modified |
| `apps/web/components/chat/use-game-chat.ts` | Modified |
| `apps/web/components/chat/chat-thread.tsx` | Modified |
| `apps/web/components/game-chat.tsx` | Modified |
| `apps/web/lib/games/actions.ts` | Modified |
| `apps/web/app/(app)/games/[id]/page.tsx` | Modified |
| `apps/web/trigger/chat.ts` | Modified |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm typecheck` (apps/web) → exit 0. `pnpm lint` (apps/web) → 0 errors, 11 pre-existing warnings (unrelated files: `trigger/example.ts`, `game-menu.tsx`, turbo env-var warnings). |
| Runtime harness | N/A in this apply session (no dev server run by the executor). Manual scenario for the user: switch tiers in the picker on a dev thread, reload, confirm `turn_usage.model_id` and the reloaded picker's selected tier match; then load a legacy dev thread whose last message metadata is `{ model: "gemini-3.1-pro-preview" }` and confirm the picker shows `pro`. |
| Rollback boundary | Revert the 17 files above (16 modified + 1 new). No other unit's code imports `model-registry.ts`, `orchestratorModelSettings`, `resolveTier`/`resolveModel`, or `readThreadTier`/`withThreadTier` yet, so the revert is self-contained. A legacy `{ model }` thread record still resolves to a tier via `LEGACY_MODEL_TIER` even after this unit ships (that mapping is what a rollback of a *later* unit would fall back on). |

### Deviations from Design

None — implementation matches `design.md` decision 18 and Amendment 2. Per the
orchestrator's guidance, `TIER_PROFILES` uses the `SlotCandidates` (readonly
tuple) shape from the Interfaces section with exactly one candidate per slot,
so unit 1c (slot fallbacks) only changes list lengths and `resolveModel`'s
`model` field, not the type shape. `resolveModel` in this unit has no fallback
logic — it always resolves the primary (first) candidate.

`resolveTier` and `resolveModel` live in `model-registry.ts` (server-only), not
re-exported through `agent.ts`; `trigger/chat.ts` and `agent.ts` both import
them directly from `model-registry.ts`, matching the Tier persistence design
note ("the single rule the ledger and the provider both use").

Renamed `modelId`/`onModelChange` props to `tierId`/`onTierChange` across the
UI caller sweep (chat-composer, new-game-composer, use-game-chat, chat-thread,
game-chat) beyond the tasks' literal "type swap" wording, because every touched
comment already had to change from "model" to "tier" language for accuracy —
keeping the old variable names next to tier-only comments would have been
actively misleading in this heavily-commented codebase.

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 1 of 15)
- Current work unit: 1a — Model tiers, registry, `resolveModel`, picker
- Boundary: starts from `master`, ends with a working tier picker + registry;
  no other unit's code depends on anything in this slice yet
- **Authored changed lines: 712** (489 insertions + 223 deletions across 17
  files, `git diff --stat` excluding `openspec/**` and the pre-existing
  unrelated `apps/web/next.config.ts` diff). This is **over the 400-line
  budget** despite being the smallest cohesive unit tasks.md defined for tier
  work. It was implemented honestly rather than trimmed: the codebase's
  block-comment density was preserved/adapted (required by project convention
  and by correctness — comments describing "model" behavior had to become
  accurate "tier" descriptions), a brand-new `model-registry.ts` (181 lines)
  implements logic that did not exist before, and the tier rename touches 9
  caller files each requiring a prop/type change per task 1a.8's explicit file
  list. **Recommendation: `size:exception` for this slice** — it cannot be
  split further without breaking unit 1a's own cohesion (tasks.md already
  chose not to split 1a further, unlike units 2/7/10), and no further line
  reduction is available without deleting comments or tests, which is
  forbidden by the apply contract.

### Status

10/10 tasks in unit 1a complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk to the user/maintainer before merge.

## Unit 1b — Usage accumulator (`chat.local`, `priceTurn`) (PR 2)

Branch: `agent-harness/1b-usage-accumulator` (stacked on
`agent-harness/1a-model-tiers`)

- [x] 1b.1 Create `apps/web/lib/games/harness/turn-state.ts`
- [x] 1b.2 Modify `apps/web/lib/ai/pricing.ts`
- [x] 1b.3 Modify `apps/web/lib/ai/message-meta.ts`, `lib/games/usage.ts`,
      `lib/games/turn-credits.ts`
- [x] 1b.4 Modify `packages/db/src/schema.ts` (code done; `pnpm db:push` could
      not run — see Issues Found)
- [x] 1b.5 Modify `apps/web/trigger/chat.ts`

5/5 tasks in unit 1b complete (1b.4's schema edit is done and typechecks; the
actual `pnpm db:push` apply is pending on the user, see below). Units
1c–10b remain (`[ ]`), unassigned to this apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/harness/turn-state.ts` | Created |
| `apps/web/lib/ai/pricing.ts` | Modified |
| `apps/web/lib/ai/message-meta.ts` | Modified |
| `apps/web/lib/games/usage.ts` | Modified |
| `apps/web/lib/games/turn-credits.ts` | Modified |
| `packages/db/src/schema.ts` | Modified |
| `apps/web/trigger/chat.ts` | Modified |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web --filter=@workspace/db` → exit 0, both packages. `pnpm turbo lint --filter=web --filter=@workspace/db` → `@workspace/db#lint` fails with "ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file" — confirmed pre-existing by stashing this unit's changes and re-running on the unmodified 1a baseline (identical failure, `packages/db` has never had an eslint config or flat config file). `pnpm lint` run directly inside `apps/web` (equivalent scope, without the `@workspace/db` turbo dependency pulling in the broken sibling task) → 0 errors, the same 11 pre-existing warnings listed in the apply prompt. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor; this unit adds no test runner). Manual scenario for the user, per tasks.md: run one turn, read `turn_usage.usage_breakdown` and confirm it holds `{ tier, entries: [{ agentId: "orchestrator", role: "orchestrator", slot: "strong", modelId, status, inputTokens, outputTokens, cachedInputTokens, reasoningTokens, costMicroUsd }] }`, and that `turn_usage.cost_micro_usd`/`credits`/token columns still match the pre-1b values for an orchestrator-only turn (no sub-agents dispatch yet, so the ledger has exactly one entry and the total must equal that entry). A second manual scenario for the stale-ledger fix: run a turn to completion (one `turn_usage` row written), then send a turn that fails the credit gate in `onValidateMessages` (e.g. temporarily zero the org's balance) and confirm NO second `turn_usage` row and NO second Polar event appear for the previous turn. |
| Rollback boundary | Revert the 7 files above (6 modified + 1 new) and the `usage_breakdown` column (drop it, or leave it — it is nullable and unread by anything if this unit is rolled back). No other unit's code reads `turnState`, `priceTurn`, `TurnCost`, `AgentUsageEntry` or `usage_breakdown` yet, so the revert is self-contained; `orchestratorEntryId()`, `withTurnMeta`, `recordTurnUsage` and `turnCreditsChunk`'s call sites all changed together in `trigger/chat.ts`, `message-meta.ts`, `usage.ts` and `turn-credits.ts`, so reverting all seven together restores the exact 1a behavior (a single `{modelId, usage}` pricing path). |

### Deviations from Design

1. **`AgentUsageEntry` and `EnvelopeStatus` placed in `lib/ai/pricing.ts`, not
   a new `harness/envelope.ts`.** `design.md`'s Interfaces section groups
   `AgentUsageEntry`/`EnvelopeStatus` under a `// harness` comment alongside
   `RoleDef`/`SubagentEnvelope`, and its File Changes table assigns their
   creation to unit 2a's `envelope.ts` (task 2a.2) — which does not exist yet.
   Unit 1b's own task 1b.1 needs `AgentUsageEntry` today, to type
   `turn-state.ts`'s ledger, before any dispatch tool or role exists. Given
   that gap, `pricing.ts` (already a 1b.2 file) is where the type is defined,
   for two reasons beyond convenience: (a) it keeps the existing import
   direction intact — every file in `lib/games` already imports from
   `lib/ai`, never the reverse, and `AgentUsageEntry` is exactly the kind of
   type `pricing.ts`'s own `priceTurn` needs to consume; defining it in
   `lib/games/harness/turn-state.ts` instead would have made `lib/ai/pricing.ts`
   import from `lib/games`, inverting that direction for the first time in the
   codebase; (b) `role` is typed as the literal `"orchestrator"` rather than
   `RoleId | "orchestrator"`, since `RoleId` (unit 2a's `roles.ts`) does not
   exist and no other role can appear in a ledger before dispatch ships. This
   is documented in the type's own comment as a forward-declaration, with the
   expectation that unit 2a either widens `role`'s literal type in place or
   moves the type into its own `envelope.ts` and has `turn-state.ts`/`pricing.ts`
   import it from there — either is a compatible widening, not a breaking
   change, for every value written against the narrower type in this unit.
   **This is a real gap in tasks.md/design.md's unit sequencing** (1b needs a
   type design.md assigns to 2a) worth flagging to the user/maintainer before
   unit 2a's tasks are drafted in detail.
2. **`orchestratorEntryId()` reads `turnState.tier` instead of re-deriving
   `resolveTier(clientData?.tier)` inline.** Not required by any task, but
   `onTurnStart` already resolves and stores the tier via `turnState.reset`
   before either completion hook runs, so every later reader — the ledger
   today, `run-subagent.ts`'s `resolveModel(turnState.tier, role.slot)` from
   unit 2a onward — reads the exact same single value rather than each
   independently calling `resolveTier` on `clientData?.tier`. Behavior is
   identical (same function, same input, same output); this only removes a
   parameter and a duplicate call site. `run()`'s own
   `orchestratorModelSettings(clientData?.tier)` call (unit 1a, unchanged)
   still derives the tier independently, which is fine — it is computed
   before `turnState.tier` would even reflect this turn's value in a
   hypothetical reordering, and it uses the identical `resolveTier` function.
3. **Added a private `creditsFromMicroUsd` helper in `pricing.ts`**, factored
   out of `turnCreditCost`'s existing formula, so `priceTurn` converts the
   turn's summed micro-dollars to credits with the exact same rounding rule
   rather than duplicating `Math.ceil((x * CREDIT_MARKUP) / MICRO_USD_PER_CREDIT)`
   at a second call site. Not a task, but a direct consequence of decision 9's
   "convert once per turn" requirement sharing code with the existing
   per-call conversion.
4. **`withTurnMeta`'s old `usage ? ... : existing` branch was removed.** The
   old signature took `usage: LanguageModelUsage | undefined` and skipped
   updating tokens/credits when it was `undefined` (a turn that produced no
   usage at all). `TurnCost` is never `undefined` — an empty ledger prices to
   all-zero tokens and credits — and adding zero to the existing accumulated
   total is a no-op, so the conditional became unnecessary rather than being
   preserved as dead code.
5. **`recordTurnUsage`'s old `if (!usage) return` became
   `if (cost.breakdown.length === 0) return`.** Same behavior (skip writing a
   ledger row when nothing in the turn ever produced usage), restated against
   the new parameter shape.

None of these change what `turn-usage-accounting`'s eight requirements ask
for; all are implementation-level consequences of task 1b.1 needing a type
design.md scheduled for a later unit.

### Fixed after coordinator review: stale-ledger re-billing

The coordinator caught a regression before this landed: `onValidateMessages`
and `hydrateMessages` run BEFORE `onTurnStart`, inside the same try the SDK
wraps the whole turn in (`node_modules/@trigger.dev/sdk/dist/esm/v3/ai.js`,
confirmed at the cited lines). If either throws for turn N+1 (the credit gate
in `onValidateMessages`, for one), `onTurnStart` never runs — so `turnState`
is never reset for N+1 — but `onTurnComplete` still fires, with `usage:
undefined`, `error: turnError`, and `turn` already equal to N+1. Before this
fix, `onTurnComplete` priced `turnState.ledger` unconditionally: still turn
N's ledger, since nothing reset it. `recordTurnUsage`'s new
`cost.breakdown.length === 0` guard (see Deviation 5) does not catch this,
because that ledger is NOT empty — it is turn N's real, already-billed
entries. The result would have been a second `turn_usage` row and a second
Polar event for turn N, plus stale credits added onto turn N+1's message via
`withTurnMeta`.

Fix: `turn-state.ts` no longer exposes a bare `ledger` getter. It exposes
`ledgerFor(turn: number)`, which returns `local.ledger` only when
`local.turn === turn` and `[]` otherwise — so a ledger that was never reset
for the turn asking about it prices as empty rather than as someone else's
turn. Both `onBeforeTurnComplete` and `onTurnComplete` in `trigger/chat.ts`
now call `priceTurn(turnState.tier, turnState.ledgerFor(turn))`
(`onBeforeTurnComplete` never actually fires on this exact path — the SDK
only calls `onTurnComplete` when a turn fails before `onTurnStart` — but it
reads the ledger the same guarded way so neither hook can drift back to
trusting an unscoped one). `turnState.addUsage` in `onBeforeTurnComplete` is
unchanged.

Checked the one edge case this fix itself could introduce: `init()`'s
placeholder `turn: 0` cannot collide with a real first turn that fails before
`onTurnStart`, because `init()` also sets `ledger: []` — so `ledgerFor(0)`
returning that placeholder ledger returns nothing there is to re-bill either
way.

### Issues Found

1. **`pnpm db:push` could not be run in this apply session.** It failed with
   a Neon credential error: `the Bearer token sent to the Neon API was
   rejected... generate or rotate an API key... or re-run npx neon auth to
   refresh the OAuth token`. This is an environment/credentials problem, not
   a schema problem — the schema change itself is additive and nullable
   (`usageBreakdown jsonb`, no default, no `notNull`), so it would not have
   prompted for data loss even if the push had run. Per the apply
   instructions, this was not forced; the user needs to refresh Neon
   credentials (`npx neon auth`, or set `NEON_API_KEY`) and run
   `pnpm db:push` from the repo root before `turn_usage.usage_breakdown`
   exists on the branch. Everything that reads/writes it
   (`schema.ts`, `usage.ts`) already typechecks against the column as
   declared in `schema.ts`, so once the push lands nothing else needs to
   change.
2. **`@workspace/db#lint` fails on the unmodified 1a baseline too** —
   confirmed by stashing this unit's changes and re-running the same command.
   `packages/db` has no `eslint.config.js`/`.mjs`/`.cjs` (ESLint 9 requires
   flat config; none was ever added to this package). This is unrelated to
   1b's schema edit and was not introduced by it.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 2 of 15)
- Current work unit: 1b — Usage accumulator (`chat.local`, `priceTurn`)
- Boundary: starts from `agent-harness/1a-model-tiers`, ends with the full
  turn (orchestrator today, every dispatched sub-agent from unit 2a onward)
  priced and summed once per turn; no other unit's code depends on anything
  in this slice yet
- **Authored changed lines: 523** (449 insertions + 74 deletions across 7
  files — 6 modified plus the new `turn-state.ts` — per
  `git diff --stat agent-harness/1a-model-tiers...HEAD`, excluding
  `openspec/**` and the pre-existing unrelated `apps/web/next.config.ts`
  diff; includes the coordinator-review stale-ledger fix above). This is
  **over the
  400-line budget**, as design.md's own file-change table anticipated ("1b at
  ~250 estimated") but undercounted, similarly to unit 1a. It was implemented
  honestly rather than trimmed: five call sites (`pricing.ts`,
  `message-meta.ts`, `usage.ts`, `turn-credits.ts`, `trigger/chat.ts`) all
  had to change together for one cohesive behavior change — the orchestrator
  and every future sub-agent priced and summed once, per
  `turn-usage-accounting`'s eight requirements — and the codebase's existing
  block-comment density was preserved/extended (required by project
  convention and, for the new `AgentUsageEntry`/`TurnCost` types, needed to
  document the deliberate deviation from design.md's file assignment; see
  Deviations above). **Recommendation: `size:exception` for this slice** — it
  cannot be split further without leaving `priceTurn` defined but unused, or
  `trigger/chat.ts` calling a function that does not exist yet, either of
  which breaks the "clear start state, clear finished state" bar this unit's
  own row in tasks.md's Suggested Work Units table sets.

### Status

5/5 tasks in unit 1b complete (schema edit done; `pnpm db:push` pending on
the user's Neon credentials — see Issues Found). Ready for `sdd-verify` once
the maintainer either runs `pnpm db:push` or accepts deferring it, and after
the user/maintainer is told about the `size:exception` line-count risk before
merge.

## Unit 1c — Slot fallbacks (PR 3)

Branch: `agent-harness/1c-slot-fallbacks` (stacked on
`agent-harness/1b-usage-accumulator`)

- [x] 1c.0 (GATE) Trace `providerOptions` from `streamText`/`ToolLoopAgent`
      through the installed model spec; record the finding at the top of
      `fallback-model.ts`
- [x] 1c.1 Create `apps/web/lib/ai/fallback-model.ts`
- [x] 1c.2 Modify `apps/web/lib/ai/model-registry.ts`
- [x] 1c.3 Modify `apps/web/lib/games/harness/turn-state.ts`, `lib/ai/pricing.ts`

4/4 tasks in unit 1c complete. Units 2a–10b remain (`[ ]`), unassigned to
this apply batch.

### GATE finding (1c.0)

Recorded in full at the top of `fallback-model.ts` (with exact `node_modules`
paths and line numbers); summarized here:

1. **`providerOptions` DOES reach `doGenerate`/`doStream`.** Traced in the
   installed `ai@7.0.93`: the step loop builds `stepProviderOptions =
   mergeObjects(providerOptions, prepareStepResult?.providerOptions)` and
   calls `stepModel.doGenerate({ ..., providerOptions: stepProviderOptions,
   ... })` — the exact value `streamText`'s top-level `providerOptions` option
   receives, unmodified, on the call options object every model
   implementation receives.
2. **The interface version differs from design.md's Technical Approach
   section**, which referenced `LanguageModelV2`. The only installed provider,
   `@ai-sdk/google-vertex@5.0.76` (via `@ai-sdk/google@4.0.64`), implements
   `specificationVersion: "v4"`. `ai` normalizes any of v2/v3/v4 to v4
   internally, so a v2 implementation would have worked too, but since every
   real candidate is already v4, the composite implements `specificationVersion:
   "v4"` directly and forwards call options unchanged — no cross-version
   translation needed. `@ai-sdk/provider` stays an undeclared (transitive-only)
   dependency; the exact v4 call-option/result types are derived structurally
   from `ai`'s own exported `LanguageModel` union, the same technique
   `model-registry.ts` already used for `ProviderOptions`.
3. **`ai`'s own retry wraps the WHOLE model call, not a per-candidate call.**
   A custom `LanguageModel` cannot observe "this is retry attempt N of the
   SDK's own maxRetries for candidate X" from inside `doGenerate`/`doStream`.
   The composite owns retrying a candidate's own retryable failures itself
   (`callCandidateWithRetry`: bounded exponential backoff — 2 retries, 2s
   initial delay, factor 2, mirroring `ai`'s own default — honoring
   `options.abortSignal` during the wait), and only marks a candidate
   unavailable once ITS OWN retries are exhausted, or immediately for an
   availability error that was never retryable (a 404, matching the primary
   verification scenario). Because the composite now owns retries,
   `agent.ts`/`trigger/chat.ts` set `maxRetries: 0` on the orchestrator's
   `streamText` call so `ai`'s own outer retry never doubles up on top of it.
   **This corrects a first-draft version that fell back on the FIRST error
   instead — see "Fixed after coordinator review" below.** None of this
   blocked implementation: the finding is mechanical (typing/retry-boundary
   detail), not an architectural mismatch, so the apply continued rather than
   stopping per the gate's own instructions.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/ai/fallback-model.ts` | Created |
| `apps/web/lib/ai/model-registry.ts` | Modified |
| `apps/web/lib/ai/agent.ts` | Modified |
| `apps/web/lib/ai/pricing.ts` | Modified |
| `apps/web/lib/games/harness/turn-state.ts` | Modified |
| `apps/web/trigger/chat.ts` | Modified |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web --filter=@workspace/db` → exit 0, both packages. `pnpm lint` (apps/web) → 0 errors, the same 11 pre-existing warnings. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor). Manual scenario for the user, per tasks.md: point a `fast` primary at an invalid provider model id in dev (e.g. temporarily set `gemini-3.5-flash-lite`'s `providerModelId` to a typo'd id in `REGISTRY`), run a turn on the `fast` tier, and confirm (a) the turn still completes, (b) `turn_usage.usage_breakdown`'s orchestrator entry names the fallback's own entry as `modelId` with `fallbackFrom` set to the invalid primary's id, and (c) a second turn in the same run goes straight to the fallback with no retry latency (the primary is remembered unavailable for the rest of the turn only — a fresh turn resets it, since `turn-usage-accounting`'s pricing follows the concrete entry that ran, not a permanent registry change). |
| Rollback boundary | Revert the 6 files above (1 new + 5 modified). `TIER_PROFILES` still holds one candidate per slot, so `resolveModel`'s observable behavior for a working primary is unchanged; a revert restores the exact 1b `resolveModel(tier, slot): ResolvedModel` two-argument signature and drops `turnState.isUnavailable`/`markUnavailable`/`servedFor`/`recordServed`, which nothing outside this unit reads yet. |

### Deviations from Design

1. **`resolveModel`, `orchestratorModelSettings` gained a third/second
   parameter (`hooks: FallbackHooks`) not shown in design.md's Interfaces
   section**, and `trigger/chat.ts` — a file tasks.md's 1c file list does not
   mention — was touched to build and pass those hooks. This was necessary,
   not optional: `lib/ai` cannot import `lib/games/harness/turn-state.ts`
   (the established, 1b-documented import direction — "every file in
   `lib/games` already imports from `lib/ai`, never the reverse"), so the
   per-turn `unavailable` set and the "who actually served" report that
   decision 19 explicitly assigns to `turnState.unavailable` cannot be read or
   written from inside the composite itself. The only caller today that can
   see both `lib/ai` and `turnState` is `trigger/chat.ts`, so it now builds
   `orchestratorHooks` (three closures over `turnState`) and passes them
   through `orchestratorModelSettings`. Without this, the fallback composite
   would work in isolation but the orchestrator's billing (`orchestratorEntryId()`)
   would keep reporting the tier's static primary even when a fallback served
   — failing 1c's own listed spec requirement (`model-tiers`' Slot Fallback
   scenario: "the usage breakdown names the serving entry ... with the primary
   recorded as the entry it replaced") and its own manual verification
   scenario ("confirm the peer serves and is billed"). `agent.ts`'s
   `orchestratorModelSettings` also gained a required (non-optional) `hooks`
   parameter for the same reason. **This is a real gap in tasks.md's file
   scope for 1c**, parallel to 1b's own documented `AgentUsageEntry`
   placement gap — worth folding into 1c's task list wording, or explicitly
   calling out `agent.ts`/`trigger/chat.ts` as touched files, before future
   units are drafted in this level of detail.
2. **`resolveModel`'s existing 2-arg call sites keep working via a
   `NOOP_HOOKS` default** (permissive `isUnavailable`, no-op
   `markUnavailable`/`onServed`), so nothing outside `trigger/chat.ts` had to
   change to keep compiling.
3. **`ResolvedModel.model`'s `provider`/`modelId` fields always name the
   slot's configured primary**, even when a fallback is actively serving —
   documented in `fallback-model.ts` as intentional: those two fields are
   `ai`'s own logging/telemetry identity, not the billing path (`hooks.onServed`
   is the billing path, and it always names whichever entry actually ran).
4. **`pricing.ts`'s only change is a comment update** on `AgentUsageEntry.fallbackFrom`
   (removing its "set once unit 1c ships" forward-declaration framing, since
   unit 1c has now shipped). `priceTurn`'s breakdown already carried
   `fallbackFrom` through since 1b (via `Omit<AgentUsageEntry, "usage"> & ...`),
   so no runtime pricing logic needed to change for 1c.3's "fallbackFrom
   carried into the breakdown" — it already was.

None of these change what `model-tiers`' Slot Fallback on Availability
Failure requirement, or `turn-usage-accounting`'s Per-Sub-Agent Usage
Breakdown Retained requirement, ask for; all are implementation-level
consequences of `lib/ai` needing a way to reach turn-scoped state it is not
allowed to import directly.

### Fixed after coordinator review: eager fallback broke the spec and regressed resilience

The coordinator caught two problems in the first version of `fallback-model.ts`
before it landed:

1. **Spec violation + resilience regression.** `specs/model-tiers/spec.md:37`
   requires falling back "after the SDK's own retries for that candidate are
   exhausted." The first version instead fell back to the next candidate on
   the FIRST error. With today's single-candidate-per-slot profiles, this was
   worse than non-compliant: a transient 429/5xx marked the ONLY candidate
   unavailable and rethrew; `ai`'s own outer retry called the composite again,
   found zero viable candidates, and threw a plain non-retryable `Error` —
   so a turn that used to survive a transient provider hiccup via `ai`'s own
   backoff now failed outright. Fix: retries moved INSIDE the composite, per
   candidate (`callCandidateWithRetry`) — a retryable availability error
   retries the SAME candidate with bounded backoff (2 retries, 2s initial
   delay, factor 2, honoring `abortSignal` during the wait; an abort during
   the wait rethrows immediately and never falls back) before the candidate is
   marked unavailable; a non-retryable availability error (404) still falls
   back immediately, since retrying an identical request against a
   permanently-missing model would never succeed. On exhaustion, the
   composite now throws the LAST REAL PROVIDER ERROR (tracked in a
   closure-scoped `lastFailure`, since `ai`'s own retries call the same
   composite instance repeatedly) instead of a synthetic `Error`. To stop
   `ai`'s own outer retry from doubling up on top of the composite's own,
   `orchestratorModelSettings` (`agent.ts`) now returns `maxRetries: 0`,
   confirmed to survive `chat.toStreamTextOptions()`'s spread (that call sets
   no `maxRetries` of its own).
2. **`providerOptions` ownership bug.** `agent.ts` was returning the slot's
   PRIMARY's `providerOptions` at the top level of `streamText`'s options; the
   composite then shallow-merged each serving candidate's own options on top
   per OUTER provider key (replacing the whole inner object), so a peer with
   no `providerOptions` of its own would still inherit the primary's (e.g. a
   reasoning-effort config it might reject with a 400 — a validation error,
   which never falls back, turning the fallback feature into a new way to
   break). Fix: the composite is now the SOLE owner of `providerOptions`.
   `agent.ts` no longer passes any `providerOptions` at the top level, and
   `withEntryProviderOptions`/`mergeProviderOptions` merge the SERVING
   candidate's own options over the caller-supplied ones per PROVIDER KEY
   (merging the inner object for a shared key, not replacing it), so a peer
   with no matching options never inherits ones that were never meant for it.

Both fixes are folded into the single 1c commit (the branch was unpushed, so
this was a soft-reset + recommit, not an amend — consistent with 1b's own
history note).

### Known limitation (documented, not fixed): last-server pricing on the orchestrator's single ledger entry

`turnState.servedFor("strong")` keeps only the LAST entry that served a call
on the slot, so a turn whose steps split between the primary and a peer that
took over mid-turn would price the orchestrator's WHOLE-TURN usage at the
last server's rate, not a per-step split — documented as a comment at
`orchestratorEntryId` in `trigger/chat.ts`. This cannot happen today: every
tier profile holds exactly one candidate per slot, so there is nothing to
fail over to mid-turn. Per-call attribution is deferred to unit 2a's
`run-subagent.ts`, which will record one `AgentUsageEntry` per dispatched run
rather than one per turn, making this limitation moot for every role that
goes through it.

### Issues Found

None beyond the scope-gap documented in Deviation 1 above.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 3 of 15)
- Current work unit: 1c — Slot fallbacks
- Boundary: starts from `agent-harness/1b-usage-accumulator`, ends with a
  working, billing-correct slot fallback for a single-candidate-per-slot
  registry population; no other unit's code depends on anything in this slice
  yet
- **Authored changed lines: 569** (537 insertions + 32 deletions across 6
  files — 5 modified plus the new `fallback-model.ts` — per
  `git diff --stat agent-harness/1b-usage-accumulator...HEAD -- . ':!openspec'`,
  excluding the pre-existing unrelated `apps/web/next.config.ts` diff;
  includes the coordinator-review fixes above). This is **over the 400-line
  budget** (the pre-fix version was 390, under budget; the correction added
  ~179 lines, mostly the per-candidate retry loop, the per-provider-key
  `providerOptions` merge, and the GATE note's documentation of both fixes
  with exact evidence). It was implemented honestly rather than trimmed: the
  retry-with-backoff logic, the abort-aware delay helper, and the deep
  provider-options merge are all genuinely new logic the correction requires,
  and the GATE note's citations (file paths, line numbers, the exact failure
  mode the coordinator caught) are load-bearing evidence, not padding — the
  apply contract forbids shrinking a diff by deleting comments or compressing
  code to fit the budget. **Recommendation: `size:exception` for this slice**,
  consistent with 1a (712) and 1b (523) both already shipping over budget in
  this same change.

### Status

4/4 tasks in unit 1c complete. Ready for `sdd-verify`. Report Deviation 1
(the `agent.ts`/`trigger/chat.ts` scope gap in tasks.md's 1c file list), the
corrected `size:exception` line-count risk, and the pending manual
dev-verification scenario to the user/maintainer.

## Unit 2a — Harness core: roles, envelope, flags, `run-subagent` (PR 4)

Branch: `agent-harness/2a-harness-core` (stacked on
`agent-harness/1c-slot-fallbacks`)

- [x] 2a.0 (GATE) Confirmed Vertex Standard/Global rates for all three
      registry entries against the Vertex AI pricing page (user confirmed
      2026-09-11) and fixed `apps/web/lib/ai/pricing.ts`
- [x] 2a.1 Create `apps/web/lib/games/harness/roles.ts`
- [x] 2a.2 Create `apps/web/lib/games/harness/envelope.ts`
- [x] 2a.3 Create `apps/web/lib/games/harness/flags.ts`
- [x] 2a.4 Create `apps/web/lib/games/harness/run-subagent.ts`

5/5 tasks in unit 2a complete. Units 2b–10b remain (`[ ]`), unassigned to
this apply batch.

### GATE finding (2a.0)

The orchestrator supplied the exact confirmed rates directly (Vertex AI
pricing page, Standard table, Global region, confirmed by the user
2026-09-11), superseding tasks.md's own more general 2a.0 wording ("confirm
the real rate... fix so cachedInput never exceeds input"). Applied exactly as
given:

- `gemini-3.5-flash-lite`: input 0.30, output 2.50, cachedInput 0.03 —
  replaces the previous UNVERIFIED placeholder (0.10 / 0.40 / 0.20) that had
  priced a cached read above a fresh one.
- `gemini-3.8-flash`: input/output unchanged (0.75 / 3.75, introductory
  through 2026-12-31); `cachedInput` corrected from 0.2 to 0.075, with the
  same 2027-01-01 doubling documented (0.15, alongside the already-known
  1.50 / 7.50).
- `gemini-3.1-pro-preview`: `cachedInput` is tiered like `input`/`output` —
  0.20 up to 200K input tokens (was a flat 0.4, over-billing every
  standard-tier cached read), 0.40 above. `ModelRate.longContext` gained an
  optional `cachedInput` field, and `turnCostMicroUsd` now reads
  `tier.cachedInput ?? rate.cachedInput` instead of always `rate.cachedInput`
  — a minimal, backward-compatible change: any future `longContext` entry
  with no `cachedInput` of its own still falls back to the base rate exactly
  as before.
- `RATE_TABLE_VERSION` bumped to `2026-09-11`.

Landed as the first change in this single unit-2a commit, ahead of every
other 2a file, per the gate's own ordering requirement.

### The `AgentUsageEntry`/`EnvelopeStatus` placement gap (flagged in unit 1b) — resolved

Unit 1b's apply-progress flagged that `AgentUsageEntry`/`EnvelopeStatus` had
to be defined in `lib/ai/pricing.ts` ahead of schedule, since design.md
assigns their creation to unit 2a's `envelope.ts`, but 1b's own ledger needed
the type before dispatch existed. Resolution, as anticipated by 1b's own
comment:

- Both types **stay defined in `pricing.ts`** — `priceTurn`/`turnCostMicroUsd`
  are what actually build and read one, and moving them to
  `harness/envelope.ts` would make `lib/ai` import from `lib/games`,
  inverting the codebase's established import direction for the first time.
- `apps/web/lib/games/harness/envelope.ts` (new, task 2a.2) re-exports both
  (`export type { AgentUsageEntry, EnvelopeStatus }`) rather than
  redeclaring them, and additionally defines `SubagentEnvelope` and a minimal
  `Finding` type (referenced by `SubagentEnvelope.findings` in design.md's
  Interfaces section, but not itself listed as a 2a.2 deliverable — unit 6's
  verifier owns its full shape; a placeholder was needed here only so
  `SubagentEnvelope` compiles).
- `AgentUsageEntry.role` widened from the literal `"orchestrator"` to
  `string` — not `RoleId | "orchestrator"` as 1b's comment had guessed —
  because `RoleId` (`lib/games/harness/roles.ts`, new in 2a) is a
  `lib/games` type, and `lib/ai` must never import from `lib/games`. Every
  value written against this field (`trigger/chat.ts`'s `role:
  "orchestrator"`, and `run-subagent.ts`'s `role: role.id` where `role.id:
  RoleId`) already satisfies the field structurally; no call site needed a
  cast or any other change. No type definitions are duplicated anywhere in
  this resolution.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/ai/pricing.ts` | Modified (2a.0 gate) |
| `apps/web/lib/games/harness/roles.ts` | Created |
| `apps/web/lib/games/harness/envelope.ts` | Created |
| `apps/web/lib/games/harness/flags.ts` | Created |
| `apps/web/lib/games/harness/run-subagent.ts` | Created |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web --filter=@workspace/db` (`--force`, no cache) → exit 0, both packages. `pnpm lint` (apps/web) → 0 errors, 12 warnings (11 pre-existing plus one new `turbo/no-undeclared-env-vars` on `HARNESS_PHASES`, same category as 6 of the 11 pre-existing warnings — `apps/web/lib/games/harness/flags.ts` is not declared in `turbo.json`'s `lint` task, which has no `env` list at all and never has for any of the app's existing env-gated files). 0 errors matches the required baseline exactly. |
| Runtime harness | N/A, per tasks.md's own row for this unit: no dispatch tool calls `run-subagent.ts` yet (that starts in unit 2b), and `HARNESS_PHASES` stays off — this unit's code is inert on every existing code path. Manual scenario for the user once unit 2b lands: `run-subagent.ts`'s per-step ledger attribution is exercised together with unit 2b's `explore` tool. |
| Rollback boundary | Revert the 4 new `harness/{roles,envelope,flags,run-subagent}.ts` files and the `pricing.ts` diff. Nothing outside this unit imports any of the 4 new files yet (2b is the first consumer), so the 4-file revert is fully self-contained. The `pricing.ts` diff is also independently revertible: reverting only the rate numbers would restore the previous (in one case incorrect) values without touching the `AgentUsageEntry`/`EnvelopeStatus` comment or type changes, and vice versa — the two are documented separately above so a partial revert stays legible. |

### Deviations from Design

1. **`SubagentProgress` (a new, 2a-local type), not `SubagentRunRecord`, is
   `run-subagent.ts`'s yielded/returned "compact preliminary record".**
   Design.md's Architecture diagram and Interfaces section both use the name
   `SubagentRunRecord` for this shape, but that type's actual creation is
   unit 9's task (`harness/records.ts`, stamping `agentId`, role,
   `displayName`, tier, slot, `modelId`, `modelName`, edits, tokens, skills —
   fields no caller can populate yet, since no dispatch tool or task exists
   before unit 2b/3). Task 2a.4 itself only asks for "compact preliminary
   records," not the named type. `SubagentProgress` carries only what
   `run-subagent.ts` can honestly know today from `fullStream`/`stream`:
   an `activity` one-liner and a list of resolved tool calls. Unit 9's own
   task (9.2) already describes modifying `run-subagent.ts` to add the
   richer stamped fields — this local type is exactly the seam that change
   is expected to widen or replace, not a permanent parallel type.
2. **`fullStream` consumed as `result.stream`.** The installed `ai@7.0.93`
   marks `StreamTextResult.fullStream` as `@deprecated` in favor of the
   identically-typed `stream` property (confirmed against
   `node_modules/ai/dist/index.d.ts`). Design.md decision 5 and the tasks
   artifact both say "fullStream" — the concept, not literally the
   deprecated property name — so `run-subagent.ts` reads `result.stream`
   and documents the substitution inline, the same way unit 1c's GATE note
   documents other installed-version mismatches against design.md's
   Technical Approach section.
3. **`onServed` is captured through a run-local closure, not
   `turnState.recordServed`.** `turnState.servedFor(slot)` keeps only the
   LAST call's server per slot — correct for the orchestrator's single
   `strong`-slot ledger entry per turn (unit 1c), but wrong the moment a
   batch of concurrent or sequential workers ever shares a slot (unit 3/4):
   the SECOND worker's `onServed` would silently overwrite the first's
   attribution before the first's `onStepEnd` could read it back.
   `run-subagent.ts`'s own `buildRunHooks()` keeps `isUnavailable`/
   `markUnavailable` wired to `turnState` (an availability failure must
   still rule a candidate out turn-wide, for every role on that slot), but
   captures `onServed` in a variable local to this one call, read back by
   this run's own `onStepEnd` before the next step can overwrite it. This is
   the "run-subagent must build its own FallbackHooks" resolution named in
   the apply prompt's known-gaps list, applied because 1c's own "last-server
   only" limitation (documented in `trigger/chat.ts`) was explicitly not to
   be copied into a runner that unit 3/4 will call concurrently.
4. **`agentId` is optional on `RunSubagentInput`, defaulting to
   `randomUUID()`.** No task or design text mandates this, but nothing in
   2a-through-2b generates a stable id for a run yet (that is unit 9's
   `records.ts` concern), and `AgentUsageEntry.agentId` is a required
   `string` today (unit 1b). A random id keeps every ledger entry
   attributable to a distinct run without inventing a naming scheme unit 9
   will likely replace.
5. **Status mapping only covers `done`/`partial`/`error`/`aborted`.**
   `EnvelopeStatus` also has `blocked`, `skipped` and `unavailable`, but none
   of those are decidable from a generic view of a finished
   `ToolLoopAgent.stream()` call — `blocked` is a role reporting itself
   unable to proceed (a per-role prompt/tool convention, not yet defined
   anywhere), and `skipped`/`unavailable` are dispatch-tool-level budget and
   verifier-sandbox decisions (units 2b/3 and 6). Documented in
   `statusFromFinishReason`'s own comment rather than guessed at.

None of these change what `agent-orchestration`'s Fixed Roles Per Phase,
Named Bot Identity Per Role, Workers Never Delegate, `ask_player` Stays With
the Orchestrator, Sub-Agent Failures Return as a Result, Abort Propagation,
or Compact Result Envelope requirements ask for; all are implementation-level
consequences of building the shared runner before any dispatch tool exists to
call it.

### Fixed after coordinator review: abort/timeout never reported as `aborted`

The coordinator caught a spec violation before this landed: `streamText`
does NOT throw on abort (`node_modules/ai@7.0.93`, ~lines 9928-9960) — a
merged signal (the caller's `abortSignal`, or `timeout` firing) closes the
stream with an `{ type: "abort" }` part instead of rejecting it. The
original code's `default: continue` skipped that part silently, so `status`
fell through to `statusFromFinishReason(await result.finishReason)` (usually
"partial") or a rejection from that same await ("error") — never "aborted",
violating `agent-orchestration`'s Abort Propagation requirement.

Fix: `case "abort"` is now handled in the stream loop, setting a local
`aborted` flag. After the loop, `aborted || abortSignal?.aborted` decides
`status = "aborted"` directly, without awaiting `finishReason`/`text` at
all. The summary text distinguishes "Cancelled." (the caller's own signal
fired) from "Timed out." (it didn't, so the role's or turn's own timeout
did) — the status is `"aborted"` either way. The real-throw `catch` block is
unchanged. Also fixed in the same pass: the 500 ms throttle could drop the
run's true final state (e.g. the last tool-result never got its own emit);
a `dirty` flag now flushes one last snapshot after the loop when the latest
update was never emitted, so `records` always ends with the run's actual
final state.

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 4 of 15)
- Current work unit: 2a — Harness core (roles, envelope, flags, `run-subagent`)
- Boundary: starts from `agent-harness/1c-slot-fallbacks`, ends with a
  correctly-priced rate table and an inert, typechecked sub-agent runner; no
  dispatch tool calls it yet (unit 2b is the first caller)
- **Authored changed lines: 509** (467 insertions + 42 deletions across 5
  files — 4 new plus the `pricing.ts` rate/type fix, including the
  coordinator-review abort/timeout fix above — per
  `git diff --stat agent-harness/1c-slot-fallbacks...HEAD -- . ':!openspec'`,
  excluding the pre-existing unrelated `apps/web/next.config.ts` diff). This
  is **over the 400-line budget**, though still the smallest overage of the
  four PRs in this change so far (1a: 712, 1b: 523, 1c: 569). It was
  implemented honestly rather than trimmed: `run-subagent.ts` (286 lines) is
  a genuinely new streaming runner with real per-step billing-attribution
  and abort-classification logic the spec requires, and the codebase's
  existing block-comment density was preserved/extended — including the
  GATE note's rate citations and the deviation/fix notes above, which are
  load-bearing evidence for a reviewer checking real money amounts and a
  spec-correctness fix, not padding. **Recommendation: `size:exception` for
  this slice**, consistent with every other unit shipped in this change so
  far.

### Status

5/5 tasks in unit 2a complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk and the resolved `AgentUsageEntry`/
`EnvelopeStatus` placement gap (from unit 1b) to the user/maintainer before
merge. Per the interactive pace instruction, this batch stops here; unit 2b
(wiring the explorer to `chat.agent`) is a separate apply.

## Unit 2b — Explorer sub-agent (PR 5)

Branch: `agent-harness/2b-explorer` (stacked on `agent-harness/2a-harness-core`).

- [x] 2b.1 Create `apps/web/lib/games/harness/tools/explore.ts`
- [x] 2b.2 Create `apps/web/lib/games/instructions/roles/explorer.ts`
- [x] 2b.3 Modify `apps/web/trigger/chat.ts`
- [x] 2b.4 Modify `apps/web/lib/games/tool-parts.ts`

4/4 tasks in unit 2b complete. Units 3–10b remain (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/harness/tools/explore.ts` | Created |
| `apps/web/lib/games/instructions/roles/explorer.ts` | Created |
| `apps/web/trigger/chat.ts` | Modified |
| `apps/web/lib/games/tool-parts.ts` | Modified |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (all three packages, `@workspace/ui` and `@workspace/db` cache-hit unchanged). `pnpm lint` run directly inside `apps/web` (`pnpm turbo lint --filter=web` still pulls in the pre-existing broken `@workspace/db#lint` task — confirmed unrelated to this unit, same as units 1b/1c/2a) → 0 errors, the same 12 warnings established as the baseline in unit 2a (11 pre-existing plus `HARNESS_PHASES`'s `turbo/no-undeclared-env-vars`). No new warning from any file this unit touched. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor). `HARNESS_PHASES` stays off, so `explore` is declared on `chat.agent({ tools })` but excluded from every real turn's `activeTools` — the manual scenario per tasks.md's own row for this unit: set `HARNESS_PHASES=true` in dev, prompt the orchestrator in a way that makes it call `explore` with a question about the current game files, and confirm (a) the reply's tool-call renders under the new "Investigating"/"Investigated" label from `tool-parts.ts`, (b) `turn_usage.usage_breakdown.entries` gains one `role: "explorer", slot: "light"` entry priced at the tier's `light` model, distinct from the orchestrator's own `strong` entry, and (c) the orchestrator's reply reflects the explorer's summary rather than a raw file dump — confirming `toModelOutput` actually truncated the envelope to text rather than passing the full `records` transcript through. |
| Rollback boundary | Revert `harness/tools/explore.ts`, `instructions/roles/explorer.ts`, and the `trigger/chat.ts`/`tool-parts.ts` diff. Nothing outside this unit imports either new file, and reverting `trigger/chat.ts`'s three additions (the `tools` factory's merge, `activeToolNames`/`PHASE_TOOLS`, and the `activeTools` line on `streamText`) restores the exact unit 2a tool set (`createGameTools(chatId)` alone, no `activeTools` narrowing at all) with no other behavior change — `HARNESS_PHASES` already gated this unit's only effect to zero on every real turn, so the revert changes nothing a live turn could observe either way. |

### Deviations from Design

1. **`run-subagent.ts`'s generator `return` value is never read by the AI
   SDK — confirmed against the installed `ai@7.0.93`'s tool executor
   (`@ai-sdk/provider-utils`'s `executeTool`), which drives a generator
   `execute` with a plain `for await...of` loop and uses only the LAST
   YIELDED value as the tool's final result. A generator's own `return`
   statement is invisible to a `for await...of` consumer — only its `yield`s
   are. `runSubagent` (unit 2a) both yields `SubagentProgress` snapshots AND
   returns `RunSubagentResult` via `return`, which was correct for that
   unit's own scope (nothing consumed the generator yet), but `explore.ts`'s
   `execute` cannot use `yield* runSubagent(...)` naively — that delegation
   pattern only helps a caller using `for await...of` on the OUTER
   generator too, and the same rule applies one level up: the SDK's own
   loop over the tool's `execute` generator would still only see `yield*`'s
   *yielded* values, not its expression value. `explore.ts`'s `execute`
   therefore drives `runSubagent`'s iterator manually
   (`run.next()` in a loop) and explicitly `yield`s the final
   `RunSubagentResult` as the last value, once the delegated generator's
   `done: true` is reached — making it the one non-preliminary value the SDK
   sees. **This is worth flagging for whoever authors unit 3's `run_tasks`
   dispatch tool**: the same manual-drive pattern applies to whatever other
   dispatch tool consumes `runSubagent`, not just `explore.ts`.
2. **`toModelOutput`'s `output` parameter types as `SubagentProgress |
   RunSubagentResult`**, the union of everything `execute` yields, rather
   than `RunSubagentResult` alone — a direct consequence of Deviation 1: the
   tool's inferred result type is the yield type of the generator, and this
   generator yields both shapes (preliminary progress, then the final
   result). A runtime type guard (`"envelope" in output`) narrows it; this
   is safe rather than merely convenient, because the installed SDK's own
   conversion path (traced in `dist/index.js`) filters preliminary
   `output-available` parts out before `toModelOutput` is ever called — the
   guard's "else" branch is unreachable in practice and exists only because
   the type checker cannot see that runtime guarantee. Documented inline at
   the guard itself.
3. **`createExploreTool` carries an explicit `Tool` return-type
   annotation**, not present in any task or design text. Without it,
   `tsc --noEmit` (this project's `declaration: true` requires every
   exported function's type to be nameable) fails with "the inferred type
   ... cannot be named without a reference to `@ai-sdk/provider-utils`" —
   this app depends on `ai`, not `@ai-sdk/provider-utils` directly, so the
   fully-inferred generic instantiation of `tool(...)` is not a type this
   project can spell. `Tool`'s own defaulted generic parameters (`any` for
   input/output/context) are sufficient: the specific types are still fully
   checked inside the `tool({...})` call itself, this annotation only
   affects what the exported function's own signature can be named as.
4. **`explorerTools` filters `createGameTools`'s entries rather than
   destructuring `read_file`/`list_files` by name.** A direct destructure
   (`const { read_file, list_files } = createGameTools(gameId)`) fails
   `tsc --noEmit` under this project's `noUncheckedIndexedAccess`: `ToolSet`
   is a `Record<string, Tool>`, so a named property read on it types as
   possibly `undefined`, correctly in general (nothing statically
   guarantees a string-keyed record holds a given key) even though this
   codebase already knows `createGameTools` always includes both.
   `Object.entries(...).filter(...)` sidesteps the indexed-access check
   entirely rather than asserting the invariant away with a non-null
   assertion at each use, keeping the "both tools always exist" knowledge in
   one named constant (`EXPLORER_TOOL_NAMES`) instead.

None of these change what `agent-orchestration`'s Role dispatch carries
fixed parameters requirement, or the explorer scenario it names, ask for —
all are TypeScript- and installed-SDK-version mechanics of wiring unit 2a's
runner to its first real caller.

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 5 of 15)
- Current work unit: 2b — Explorer sub-agent
- Boundary: starts from `agent-harness/2a-harness-core`, ends with a working
  `explore` dispatch tool declared on `chat.agent({ tools })` and narrowed
  out of every real turn by `activeTools` while `HARNESS_PHASES` stays off;
  no later unit's code depends on anything in this slice yet
- **Authored changed lines: 230** (228 insertions + 2 deletions across 4
  files — 2 new plus `trigger/chat.ts` and `tool-parts.ts` — per
  `git diff --stat` against `agent-harness/2a-harness-core`, excluding
  `openspec/**` and the pre-existing unrelated `apps/web/next.config.ts`
  diff). Well **under the 400-line budget** — the first unit in this change
  to land under it — because this unit adds one dispatch tool and its role
  instructions rather than a new runner or registry, and the flag keeps its
  only wiring point (`trigger/chat.ts`) to a handful of lines.

### Status

4/4 tasks in unit 2b complete. Ready for `sdd-verify`. Report the
generator-return-value gap (Deviation 1) to whoever authors unit 3's
`run_tasks` dispatch tool, and the manual dev-verification scenario (set
`HARNESS_PHASES=true` and dispatch `explore`) to the user/maintainer. Per the
interactive pace instruction, this batch stops here; unit 3 (file ownership +
sequential worker) is a separate apply.

## Unit 3 — File ownership + sequential worker (PR 6)

Branch: `agent-harness/3-file-ownership` (stacked on
`agent-harness/2b-explorer`).

- [x] 3.1 Modify `apps/web/lib/games/tools.ts`: export the tool builders and
      `resolveGamePath`; protected-prefix guard for `engine/`, `vendor/`,
      `.numa/`
- [x] 3.2 Create `apps/web/lib/games/harness/ownership.ts`:
      `createScopedGameTools(gameId, owns)`
- [x] 3.3 Create `apps/web/lib/games/harness/tools/run-tasks.ts` (sequential
      only)
- [x] 3.4 Create `apps/web/lib/games/instructions/roles/worker.ts` (shared) +
      per-focus prompt sections
- [x] 3.5 Modify `apps/web/trigger/chat.ts`: `changedGameFiles` counts
      `run_tasks` edits

5/5 tasks in unit 3 complete. Units 4–10b remain (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/tools.ts` | Modified — split into exported per-tool builders, added the protected-prefix guard |
| `apps/web/lib/games/harness/ownership.ts` | Created |
| `apps/web/lib/games/harness/tools/run-tasks.ts` | Created |
| `apps/web/lib/games/instructions/roles/worker.ts` | Created |
| `apps/web/lib/games/harness/envelope.ts` | Modified — `renderEnvelope` moved here from `explore.ts` |
| `apps/web/lib/games/harness/tools/explore.ts` | Modified — now imports `renderEnvelope` instead of defining it |
| `apps/web/trigger/chat.ts` | Modified — `run_tasks` declared, gated, and counted for preview reload |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (all three packages). `pnpm lint` run directly inside `apps/web` → 0 errors, the same 12 pre-existing warnings established as the baseline since unit 2a. No new warning from any file this unit touched. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor). `HARNESS_PHASES` stays off, so `run_tasks` is declared on `chat.agent({ tools })` but excluded from every real turn's `activeTools`. Manual scenario for the user, per tasks.md's own row for this unit: set `HARNESS_PHASES=true` in dev, dispatch one worker task (e.g. a `gameplay` task owning `game.js`) and confirm it writes only within its declared `owns`, then dispatch a second task whose `owns` names a path the first task did not declare and confirm the write tool call returns `{ error }` naming the path and "outside this task's declared ownership" rather than silently succeeding; also confirm a task that declares ownership of a path under `engine/`, `vendor/` or `.numa/` is rejected by the protected-prefix guard regardless of that declared ownership, and that a `delete_file` call for `index.html` is still rejected even when a task's `owns` includes it. |
| Rollback boundary | Revert `harness/ownership.ts`, `harness/tools/run-tasks.ts`, `instructions/roles/worker.ts`, and the diffs in `tools.ts`, `harness/envelope.ts`, `harness/tools/explore.ts` and `trigger/chat.ts`. `tools.ts`'s refactor is behavior-preserving for every existing caller — `createGameTools(gameId)` still returns the exact same `ToolSet` shape, and the protected-prefix guard is new, additive rejection logic that could only ever turn a previously-allowed write into a rejection (an `engine/`/`vendor/`/`.numa/` write was never something a turn should have been doing), never the reverse — so a revert restores unit 2b's exact behavior with no other unit depending on anything added here. |

### Deviations from Design

1. **`tools.ts`'s write tool builders (`createWriteFileTool`,
   `createReplaceTextTool`, `createDeleteFileTool`) take an optional
   `guard?: PathGuard` parameter, not named in design.md's Interfaces
   section.** This is the mechanism decision 11's own "wraps the tool
   builders exported from `tools.ts`" phrase leaves open: `harness/ownership.ts`
   needed a way to layer an ownership check on top of the same builder the
   orchestrator's own unscoped `createGameTools` uses, without a second
   implementation of path resolution, protected-prefix checking or the
   sandbox write itself. A `PathGuard` (`(relative: string) => ToolError |
   undefined`), called after the protected-prefix guard and before the write,
   is the smallest change that lets both callers share one implementation —
   `createGameTools` passes none (only the protected-prefix guard applies),
   `createScopedGameTools` passes one built from `task.owns`.
2. **`run_tasks`' per-task result reports `wroteFiles: boolean`, not
   `SubagentEnvelope.edits: string[]` (the file paths).** Design.md's Data
   Flow section shows `run_tasks`' envelope carrying "edits" per task, but
   `run-subagent.ts` (unit 2a) only records tool NAMES on each step
   (`{ toolName, toolCallId, ok, error }`), not the paths a call touched —
   unit 9's task (9.2) is what stamps richer fields, path included, onto a
   `SubagentRunRecord`. `trigger/chat.ts`'s `changedGameFiles` only needs a
   boolean ("did this turn write anything, so the preview should reload"),
   so `wroteFiles` is exactly what unit 3 can honestly report today; unit 9's
   own change is expected to let a later unit populate `edits` properly
   without changing `wroteFiles`' own meaning.
3. **Design inlining (decision 7, "the dispatch code inlines the design into
   each worker's prompt") is not implemented in unit 3.** `.numa/design.md`
   does not exist until unit 8's `submit_plan` ships. `task.goal`
   (`taskSpecSchema`: "goal, procedure, constraints, done-when; ≤ 1200
   chars") is the worker's complete brief in its place — matching `TaskSpec`'s
   own field comment in design.md's Interfaces section, which already
   describes `goal` as carrying all of that.
4. **`TaskSpec.skills` is typed `string[]`, not `SkillName[]`.** `SkillName`
   (`lib/games/skills/registry.ts`, unit 7a) does not exist yet. Documented
   inline in `run-tasks.ts` as the same kind of forward-declaration gap unit
   1b's `AgentUsageEntry.role` and unit 2a's `SubagentProgress` recorded for
   their own not-yet-built dependencies; nothing in unit 3 reads `skills` at
   all, so no call site needs to change when unit 7b widens what consumes it.
5. **Worker instructions inline the FULL `engineInstructions.content`**
   (`instructions/engine.ts`, pre-unit-7), not "defaults ∪ task skills"
   (design.md's role catalogue Instructions column, and decision 14). The
   skills registry does not exist until unit 7a/7b. This matches what the
   orchestrator itself still does pre-unit-7 (`instructions/index.ts` pushes
   the same full `engineInstructions`), so a worker and the orchestrator see
   the same engine knowledge until unit 7 replaces both with the split-skill
   version.
6. **`run-tasks.ts` does not implement decision 12's pairwise ownership-overlap
   or `dependsOn` checks.** `tasks.md`'s own unit 4 task (4.1) explicitly
   assigns "pairwise ownership-overlap + `dependsOn` check before dispatch" to
   that unit's change to this same file, alongside the concurrency pool —
   unit 3 is sequential-only by its own task wording (3.3), so two tasks in
   one batch can never actually run concurrently regardless of whether their
   `owns` overlap, which is what `file-ownership`'s Parallel Dispatch
   Requires Disjoint Ownership requirement is protecting against. Unit 4 adds
   the check when it adds the thing the check is for.

None of these change what `file-ownership`'s Declared Ownership Per Task,
Out-of-Scope Writes Rejected, Engine/Vendor Protections Preserved,
`index.html` Cannot Be Deleted requirements, or `agent-orchestration`'s
Parallel Dispatch Only on Disjoint Ownership requirement (sequential half —
trivially satisfied, since nothing in unit 3 ever dispatches concurrently)
ask for; all are implementation-level consequences of building the sequential
runner before the planner (unit 8) or skills registry (unit 7) exist to feed
it design bodies or skill lists.

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 6 of 15)
- Current work unit: 3 — File ownership + sequential worker
- Boundary: starts from `agent-harness/2b-explorer`, ends with a working,
  ownership-scoped, sequential `run_tasks` dispatch tool declared on
  `chat.agent({ tools })` and narrowed out of every real turn by
  `activeTools` while `HARNESS_PHASES` stays off; explorer's own path
  (unit 2b) is unaffected — `renderEnvelope`'s move to `envelope.ts` is a
  pure relocation, not a behavior change, confirmed by `explore.ts` importing
  the exact same function body
- **Authored changed lines: see the apply return envelope's exact
  `git diff --stat 8e19805..HEAD` figure** (excluding `openspec/**` and the
  pre-existing unrelated `apps/web/next.config.ts` diff, per every prior
  unit's own methodology in this file). `tools.ts`'s own diff is large
  relative to its actual logic change: every one of its six tool definitions
  moved from an inline object-literal value inside one `createGameTools`
  function into its own exported, independently-callable function
  (`createReadFileTool`, `createWriteFileTool`, etc. — task 3.1's own
  wording, "export the tool builders"), which re-indents essentially the
  whole file even though the tool bodies themselves are close to verbatim
  plus the new protected-prefix/ownership guard calls. This was implemented
  honestly rather than trimmed or reformatted to minimize the diff: the
  refactor is what `harness/ownership.ts` needs to reuse the exact same
  path-resolution, protected-prefix and sandbox-write logic the orchestrator's
  own tools use, rather than a second implementation of any of it.
  **Recommendation: `size:exception` for this slice**, consistent with every
  other unit shipped in this change so far.

### Status

5/5 tasks in unit 3 complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk, the `wroteFiles`-vs-`edits` gap (Deviation
2, for unit 9 to resolve), and the pending manual dev-verification scenario
to the user/maintainer. Per the interactive pace instruction, this batch
stops here; unit 4 (parallel dispatch) is a separate apply.

## Unit 4 — Parallel dispatch (gated) (PR 7)

Branch: `agent-harness/4-parallel` (stacked on `agent-harness/3-file-ownership`).

- [x] 4.0 (GATE) Spike: concurrent Gemini-on-Vertex calls from `ToolLoopAgent`s
      — recorded in `docs/research/spikes/gemini-parallel.md` (landed and
      committed separately from this batch, `01650af`'s parent)
- [x] 4.1 Modify `apps/web/lib/games/harness/tools/run-tasks.ts`: concurrency
      pool (cap 3, batch ≤ 4), pairwise ownership-overlap + `dependsOn` check
      before dispatch, `Promise.all`-style wait

2/2 tasks in unit 4 complete. Units 5–10b remain (`[ ]`), unassigned to this
apply batch.

### GATE finding (4.0)

Recorded in full in `docs/research/spikes/gemini-parallel.md`; summarized
here since it directly shaped 4.1's implementation:

- **Verdict: works, no serialization fallback needed, keep the cap at 3.**
  3 concurrent `ToolLoopAgent` runs on `gemini-3.5-flash-lite` (Vertex) via
  `Promise.all` completed with zero errors, ~3x faster than sequential (1.6 s
  vs 4.3 s for the same 3 runs).
- At 2× the cap (6 concurrent runs), still zero errors, but one run per batch
  stalled 27–35 s in its second step (the call after the tool result) across
  both 6-run trials. The spike could not isolate the cause (server-side
  queueing is plausible) but confirmed a stalled call still finishes — it
  only costs wall time.
- Consequence for 4.1: no code change to fall back to sequential dispatch on
  overload; the pool simply never exceeds `POOL_CAP = 3`, and every worker
  stays bounded by `run-subagent.ts`'s existing per-role timeout (already
  shipped in unit 2a), so a stalled worker can delay but never indefinitely
  hold its batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/harness/tools/run-tasks.ts` | Modified — sequential per-task loop replaced by a concurrency-pool scheduler |
| `apps/web/lib/games/harness/ownership.ts` | Modified — added `ownershipOverlaps`, the pairwise entry-conflict check the scheduler needs |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm --filter web typecheck` → exit 0. `pnpm --filter web lint` → 0 errors, the same 12 pre-existing warnings established as the baseline since unit 2a; no new warning from either file this unit touched. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor). `HARNESS_PHASES` stays off, so `run_tasks` is still excluded from every real turn's `activeTools` — this unit only changes what already-inert tool does internally. Manual scenario for the user, per tasks.md's own row for this unit: set `HARNESS_PHASES=true` in dev, dispatch a batch of two tasks with disjoint `owns` and confirm both workers' preliminary progress interleaves in the stored tool output (rather than one fully finishing before the other starts) and both `turn_usage.usage_breakdown` entries bill correctly; then dispatch a batch where task `t2` has `dependsOn: ["t1"]` and `owns` overlapping `t1`'s, and confirm `t2` does not start until `t1`'s envelope settles; then dispatch a batch where one task's `dependsOn` names an id not in the batch and confirm that task comes back `status: "blocked"` without ever being dispatched, while its unrelated sibling tasks still complete normally. |
| Rollback boundary | Revert the two files above. The sequential unit-3 behavior (`git show 01650af:apps/web/lib/games/harness/tools/run-tasks.ts`) is fully restored by reverting `run-tasks.ts` alone; `ownershipOverlaps` is new, additive, and unused by any other file, so removing it alongside is safe and self-contained. No other unit's code imports anything this unit added. |

### Deviations from Design

1. **An "unmet `dependsOn`" outcome uses `status: "blocked"`, not a thrown
   error or a silently-dropped task.** Neither tasks.md's task 4.1 wording
   nor design.md's decision 12 names the exact envelope shape a rejected task
   gets back — decision 12 only says `run_tasks` "rejects" it. `blocked` is
   the one `EnvelopeStatus` value (design.md's Interfaces section) that
   already means "the run could not proceed" without claiming an execution
   failure (`error`) or a cancellation (`aborted`) that did not happen — the
   task simply never started. One message covers three distinct causes
   (unknown id, self-dependency, a `dependsOn` cycle among the batch's own
   tasks) rather than a bespoke message per cause: from the scheduler's own
   point of view they are identical — a task whose dependency will never
   read as finished — and tasks.md's own wording ("rejects any task whose
   `dependsOn` has not finished this turn") does not distinguish them either.
2. **No explicit graph algorithm for cycle detection.** The scheduler instead
   detects a stall generically: if a pass finds nothing startable and nothing
   currently running, whatever tasks remain are unsatisfiable, for any
   reason. This correctly and uniformly catches an unknown id, a
   self-dependency, and a multi-task cycle without a separate topological
   check, and keeps the scheduler's only "reject" path in one place rather
   than validating the batch's dependency graph twice (once up front, once
   during scheduling).
3. **Progress preliminaries are tagged with `taskId`, not `agentId`.**
   `run-subagent.ts`'s `SubagentProgress` (unit 2a) carries neither field —
   it was written when only one worker was ever in flight, so nothing
   identified which run a snapshot belonged to. The apply prompt's own
   parenthetical ("stays attributable (agentId)") is satisfied by `taskId`:
   it is the same attribution *purpose*, and `taskId` is the key this file's
   own `TaskOutcome` already reports outcomes by, so a caller correlating a
   preliminary snapshot with its final outcome uses one consistent id rather
   than two (a `taskId` here, an `agentId` there that happens to equal a
   random UUID `runSubagent` generated internally, per unit 2a's own
   documented default). `SubagentEnvelope.agent` (the final envelope's own
   identity field) is unaffected — it still comes from `runSubagent`
   unchanged.
4. **A generic event queue (`pushEvent`/`settle`/`wake`), not a `for await`
   merge over several async iterators.** Neither tasks.md nor design.md
   specifies the interleaving mechanism — only that progress must interleave
   and the final wait must be `Promise.all`-style. A small single-consumer
   push queue was the smallest correct way to let `execute`'s single
   generator body observe events pushed by however many `runOneTask` calls
   are concurrently in flight (JS has no native `Promise.race`-over-async-
   generators primitive), without adding a dependency or a separate module.
5. **A defensive `.catch` around the whole scheduler**, settling every
   not-yet-settled task with an `error` outcome if `scheduleAndRun` itself
   ever rejects. Not required by any task — `runSubagent` already catches
   its own failures into an envelope, so nothing in the normal path should
   throw — but its absence would have meant an unexpected scheduler bug left
   the tool call permanently unresolved instead of reporting a result,
   which is exactly the failure mode `agent-orchestration`'s Sub-Agent
   Failures Return as a Result requirement (and its Abort Propagation
   sibling) both exist to prevent.

None of these change what `agent-orchestration`'s Parallel Dispatch Only on
Disjoint Ownership requirement or `file-ownership`'s Parallel Dispatch
Requires Disjoint Ownership requirement (both concurrent halves) ask for —
every dispatch this scheduler makes still only runs two tasks concurrently
when their `owns` are disjoint, and it never launches more than `POOL_CAP`
workers regardless of what the model's tool call looked like. All five points
above are implementation-level consequences of interleaving several
concurrent generator-driven runs inside one tool call, a mechanism neither
document specifies past "concurrency pool" and "`Promise.all`-style wait."

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 7 of 15)
- Current work unit: 4 — Parallel dispatch (gated)
- Boundary: starts from `agent-harness/3-file-ownership`, ends with
  `run_tasks` dispatching disjoint-ownership tasks concurrently (cap 3) while
  respecting `dependsOn` and ownership overlap, still narrowed out of every
  real turn by `activeTools` while `HARNESS_PHASES` stays off; unit 3's
  sequential-only behavior for a single-task batch, or a batch whose tasks
  all conflict pairwise, is unchanged (the scheduler degrades to running one
  task at a time in that case, by construction)
- **Authored changed lines (before correction): 320** (273 insertions + 47
  deletions across 2 files, `git diff --stat -- . ':!openspec'
  ':!apps/web/next.config.ts'` against `agent-harness/3-file-ownership`,
  excluding the pre-existing unrelated `apps/web/next.config.ts` diff).
  **Updated total after the correction below: 414** (361 insertions + 53
  deletions across 3 files — `run-tasks.ts`, `ownership.ts`,
  `turn-state.ts` — `git diff --stat agent-harness/3-file-ownership --
  apps/web/lib/games/harness/tools/run-tasks.ts
  apps/web/lib/games/harness/ownership.ts
  apps/web/lib/games/harness/turn-state.ts`). This crosses the 400-line
  budget by 14 lines. Not re-split: the correction fixes three defects
  (a spec-compliance gap, a silent-data-loss input bug, and stale docs) in
  code this same unit already owns, and splitting a bug fix for code not
  yet merged into its own PR would not reduce total reviewer burden, only
  fragment it. `size:exception` recommended for this slice, consistent with
  every over-budget unit already shipped in this change.

### Correction (parent review of `2e47962`, same attempt token, one scoped fix)

Three issues found in review, all fixed in this one correction:

1. **Cross-call `dependsOn` was rejected.** `canStart`'s dependency check
   required `ids.has(dep)` (the id must be in THIS batch), so a task naming
   an id from an EARLIER `run_tasks` call in the same turn came back
   `blocked` — violating design.md decision 12's actual wording ("has not
   finished this turn", turn-scoped, not batch-scoped) and directly
   contradicted by this same tool's own description, which tells the model
   it can split work across several calls. Fixed by adding
   `finishedTaskIds: Set<string>` to `turn-state.ts`'s `TurnStateData`
   (reset in both `init()` and `reset()`, alongside `unavailable`/`served`),
   with `isTaskFinished`/`markTaskFinished` accessors mirroring the existing
   `isUnavailable`/`markUnavailable` pattern. `run-tasks.ts`'s `runOneTask`
   calls `turnState.markTaskFinished(task.id)` once a task actually runs to
   completion (never for a task rejected before it started — an unmet
   dependency or the turn ending first never "finished", so nothing later
   can depend on it either). `canStart` now resolves a dependency against
   `done` (this batch) when the id is in the batch, and against
   `turnState.isTaskFinished` otherwise — an id in the batch is never
   checked against `turnState`, since by definition it has not finished
   until this batch's own scheduler says so.
2. **Duplicate task ids in one batch silently dropped a task.** `indexById`
   and `remaining` are keyed by task id; a second task sharing an id
   overwrote the first's slot, so one task never ran and was never reported
   back — a silent data-loss bug, not a crash. Fixed with a `.superRefine`
   on a new `tasksArraySchema` (now `inputSchema`'s `tasks` field): duplicate
   ids fail zod validation before dispatch, reported per zod v4's
   `ctx.addIssue({ code: "custom", path: [index, "id"], message })`, at the
   exact index of the offending task, naming which id repeated and which
   task first used it — surfaced to the model as a correctable tool-input
   error, the same channel every other schema violation on this tool already
   uses.
3. **Stale docs.** `taskSpecSchema.dependsOn`'s `.describe()` still said "Not
   yet enforced by run_tasks" from before unit 4 existed. Rewritten to state
   what is actually enforced now: a dependency in the same batch is waited
   for, one that finished in an earlier call this same turn counts as done,
   and anything else (unknown id, self-dependency, cycle) blocks the task.
   The same stale "this batch" framing was also corrected in three other
   comments/strings this unit had written before the fix (the tool's own
   `description`, `createRunTasksTool`'s top JSDoc, and the scheduler's
   rejection-branch comment) and in `unmetDependencyOutcome`'s summary text,
   so nothing in the file still implies `dependsOn` is batch-scoped.

Verification: `pnpm --filter web typecheck` → exit 0. `pnpm --filter web
lint` → 0 errors, the same 12 pre-existing warnings established as the
baseline since unit 2a; no new warning from any file this correction
touched.

Files touched by the correction: `apps/web/lib/games/harness/tools/run-tasks.ts`
(modified further), `apps/web/lib/games/harness/turn-state.ts` (modified —
new `finishedTaskIds` field and accessors). `ownership.ts` was not touched by
the correction.

Committed on `agent-harness/4-parallel`, same branch as `2e47962`, one commit
after it, no other changes.

### Status

2/2 tasks in unit 4 complete, correction applied and verified. Ready for
`sdd-verify`. Report the updated `size:exception` line-count (414, was 320)
and the manual dev-verification scenario (interleaved progress, a
`dependsOn`-gated task including one that depends on an id from an earlier
call this turn, a rejected-unmet-dependency task, and a rejected-duplicate-id
batch) to the user/maintainer. Per the interactive pace instruction, this
batch stops here; unit 5 (Chromium snapshot) is a separate apply and depends
on its own gate spike (5.0) first.
