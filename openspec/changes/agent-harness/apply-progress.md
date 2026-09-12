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

## Unit 7b — `loadSkill` tool + role defaults wiring (PR 11)

Branch: `agent-harness/7b-load-skill` (stacked on
`agent-harness/7a-skills-registry`).

- [x] 7b.1 Create `apps/web/lib/games/harness/tools/load-skill.ts`
- [x] 7b.2 Delete `apps/web/lib/games/instructions/engine.ts`
- [x] 7b.3 Modify `apps/web/lib/games/instructions/index.ts` (+
      `apps/web/lib/games/harness/tools/run-tasks.ts`, `trigger/chat.ts`,
      `lib/games/skills/registry.ts` — see Deviation 1 below)

3/3 tasks in unit 7b complete. Units 8–10b remain (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/harness/tools/load-skill.ts` | Created |
| `apps/web/lib/games/instructions/engine.ts` | Deleted |
| `apps/web/lib/games/instructions/index.ts` | Modified |
| `apps/web/lib/games/skills/registry.ts` | Modified |
| `apps/web/lib/games/harness/tools/run-tasks.ts` | Modified |
| `apps/web/trigger/chat.ts` | Modified |

### Deviations from Design

1. **Task 7b.3's own wording ("Modify `instructions/index.ts`") undersells
   this task's real scope, which the apply prompt's own "Read first" section
   flagged in advance.** `instructions/index.ts` only ever built the
   ORCHESTRATOR's system prompt; a worker's instructions are assembled
   entirely in `harness/tools/run-tasks.ts`'s own `buildInstructions`
   (unit 3), which is where "workers get role defaults ∪ `TaskSpec.skills`"
   actually had to land. `trigger/chat.ts` also needed the `load_skill`
   tool declared and gated (design.md's role catalogue: orchestrator gets
   `load_skill`, matching every other dispatch tool's `PHASE_TOOLS`/
   `activeTools` treatment) — a wiring point design.md's own File Changes
   table for unit 7 does not list, the same kind of gap 1b/1c/2a each
   documented for their own units. `lib/games/skills/registry.ts` gained two
   new exports (`skillBodies`, `mergeSkills`) rather than duplicating the
   join/dedupe logic at both call sites (the orchestrator's and a worker's).
2. **`skillBodies`/`mergeSkills` live in `registry.ts`, not a new module.**
   Both are small, pure functions over the registry's own data
   (`SKILLS`, `SkillName`), and `registry.ts` already owns "what counts as a
   known skill" (`isSkillName`, unit 7a) — adding "how a role's skill list is
   composed" to the same file keeps one owner for both concerns, rather than
   splitting registry data from registry composition logic across two files
   nothing else needed split.
3. **`taskSpecSchema.skills` is now `z.array(z.enum(ALL_SKILL_NAMES))`**, not
   `z.array(z.string())` as unit 3's original placeholder had it (documented
   there as a forward-declaration gap, per this apply prompt's own
   instruction to tighten it). A task naming an unknown skill now fails
   `run_tasks`' own input validation before dispatch, the same channel every
   other schema violation on this tool already uses, rather than silently
   reaching a worker whose `load_skill` call for that name would return
   `{ error }` anyway — catching it earlier is strictly better feedback to
   the orchestrator's own model.
4. **`load_skill` is NOT added to `tool-parts.ts`'s `TOOL_LABELS`.** Neither
   task 7b.1 nor design.md's File Changes table for unit 7 names
   `tool-parts.ts` (unlike unit 2b's explicit `tool-parts.ts` task for
   `explore`), and the apply prompt scoped this batch to tasks 7b.1–7b.3
   only. A `load_skill` call still renders correctly — `toolLabel`'s own
   generic fallback (`labels ?? { active: name, done: name, failed: ...}`)
   shows the raw tool name rather than a crafted verb — which is acceptable
   for a tool design.md itself calls a rare fallback, not a primary player-
   visible action. Flagged here for whoever picks up a UI polish pass later,
   the same way unit 7a flagged its own `ROLE_DEFAULT_SKILLS` judgment call.

None of these change what `agent-skills`'s Orchestrator-Selected Extra
Skills, `loadSkill` Fallback With Capped/Truncated Output, Unknown Skill
Name Returns an Error, or No Shell Execution Exposed requirements ask for;
all are implementation-level consequences of wiring a tool and a skill
composition rule into the two places (`trigger/chat.ts`'s tool set,
`run-tasks.ts`'s prompt assembly) that tasks.md's own wording under-scoped.

### Orchestrator prompt identity check (task 7b.3's own requirement)

Verified the orchestrator's system prompt is byte-identical to before this
unit, per the apply prompt's explicit instruction:

1. Extracted the pre-this-unit `engineInstructions.content` string by
   running `git show agent-harness/6-verify-role:apps/web/lib/games/instructions/engine.ts`
   into a standalone file and evaluating it with
   `node --experimental-strip-types` (Node 26; `import type` erased,
   confirmed no runtime import needed beyond the file's own literal —
   `agent-harness/6-verify-role` and 7a's tip both hold the exact same
   `engine.ts`, since 7a never touched it, so this is the same content the
   orchestrator has always received). Length: 10,010 characters.
2. Extracted the new `skillBodies(ORCHESTRATOR_DEFAULT_SKILLS)` output by
   copying `lib/games/skills/*.ts` to a scratch directory, rewriting each
   relative import to carry an explicit `.ts` extension (required for
   Node's ESM resolver, not for `tsc`), dropping the one type-only `RoleId`
   import (erased by stripping either way, and its module lives behind a
   `@/` path alias Node cannot resolve on its own), and evaluating the
   result the same way. Length: 10,010 characters, in the expected order
   (`engine-core, engine-utils, engine-movement, engine-scene,
   engine-feedback, engine-audio, engine-systems, engine-reference`).
3. `diff` on the two extracted text files reported no differences, and
   `shasum -a 256` on both files produced the identical digest
   (`f611bd22b2b443a3dbdf332dddbf5beab4cfe9f5d5e69f3d726478f045289d1d`).
   The orchestrator's `gameInstructions` array is therefore byte-identical
   to before this unit: same `workflowInstructions`/`runtimeInstructions`
   entries (untouched), and the third entry's `{ role: "system", content }`
   is the exact same `role` and now-proven-identical `content`.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (`web` fresh, `@workspace/ui`/`@workspace/db` cache-hit, both unchanged by this unit). `pnpm lint` run directly inside `apps/web` → 0 errors, the same 13 pre-existing warnings established as the baseline in unit 7a. No new warning from any file this unit touched or created. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor; `HARNESS_PHASES` stays off, so `load_skill` is declared but not in `activeTools` on any real turn). Manual scenario for the user, per tasks.md's own row for this unit: set `HARNESS_PHASES=true` in dev, dispatch a worker via `run_tasks` naming a task-only skill outside its role's defaults (e.g. an `audio` task with `skills: ["engine-reference"]`), and confirm that skill's body appears in the worker's system prompt alongside its defaults; separately, have the orchestrator or a worker call `load_skill` with an unknown name and confirm it gets back `{ error }` listing the 8 valid skill names, never an empty or fabricated result. |
| Rollback boundary | Revert `harness/tools/load-skill.ts` (new), the `instructions/index.ts`/`run-tasks.ts`/`trigger/chat.ts` diffs, the `registry.ts` addition, and restore `instructions/engine.ts` from `agent-harness/7a-skills-registry`. Restoring `engine.ts` and reverting `instructions/index.ts`'s import back to it, and `run-tasks.ts`'s `buildInstructions` back to `engineInstructions.content`, fully restores unit 7a's own end state — nothing outside this unit's own 6 files reads `skillBodies`/`mergeSkills`/`createLoadSkillTool` yet. |

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 11 of 15)
- Current work unit: 7b — `loadSkill` tool + role defaults wiring
- Boundary: starts from `agent-harness/7a-skills-registry`, ends with
  `instructions/engine.ts` gone, the orchestrator's prompt proven
  byte-identical to before, and every worker's instructions built from
  `ROLE_DEFAULT_SKILLS[role] ∪ TaskSpec.skills` instead of the full engine
  reference; unit 8's planner and routing are untouched
- **Authored changed lines: 473** (194 insertions + 279 deletions across 6
  files — 1 new, 1 deleted, 4 modified — per `git diff --cached --stat`,
  excluding `openspec/**` and the pre-existing unrelated
  `apps/web/next.config.ts` diff). This is **over the 400-line budget**,
  consistent with every other unit shipped in this change so far (1a: 712,
  1b: 523, 1c: 569, 2a: 509, 7a: 476). Most of the deletion count is
  `engine.ts`'s own 246 lines going away in one commit with the file that
  replaces its content already having landed in 7a — task 7b.2 cannot
  delete less of it and task 7b.3 cannot wire workers/orchestrator to the
  registry with less code without skipping the identity-check documentation
  or the deviation notes above, which the apply contract forbids trimming
  for budget. **Recommendation: `size:exception` for this slice**,
  consistent with every over-budget unit already shipped in this change.

### Status

3/3 tasks in unit 7b complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk, the `tasks.md` scope gap this unit's
Deviation 1 documents (`trigger/chat.ts` and `run-tasks.ts` needed changes
task 7b.3's own wording did not name), and the deliberate non-change to
`tool-parts.ts` (Deviation 4) to the user/maintainer before merge. Per the
interactive pace instruction, this batch stops here; unit 8 (size routing +
phase flow) is a separate apply.

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

## Unit 5 — Chromium snapshot (gated) (PR 8)

Branch: `agent-harness/5-chromium-snapshot` (stacked on
`agent-harness/4-parallel`). Task 5.0 (the gate spike) already passed before
this apply started — recorded in
`docs/research/spikes/chromium-snapshot.md`, GO on all 6 criteria.

- [x] 5.1 Create `apps/web/lib/daytona/game-image.ts`
- [x] 5.2 Create `apps/web/scripts/build-game-snapshot.ts`
- [x] 5.3 Modify `apps/web/lib/daytona/utils.ts`

3/3 tasks in unit 5 complete. Units 6–10b remain (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/daytona/game-image.ts` | Created |
| `apps/web/scripts/build-game-snapshot.ts` | Created |
| `apps/web/lib/daytona/utils.ts` | Modified — `createSandboxForGame` helper, `CHROMIUM_LABEL` |
| `apps/web/package.json` | Modified — `snapshot:build` script |
| `apps/web/tsconfig.json` | Modified — `allowImportingTsExtensions` |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm --filter web typecheck` → exit 0. `pnpm --filter web lint` → 0 errors, 13 warnings (the 12 pre-existing baseline since unit 2a, plus one new `turbo/no-undeclared-env-vars` on `DAYTONA_GAME_SNAPSHOT` in `utils.ts` — same category as 6 of the pre-existing warnings, `turbo.json`'s `lint` task declares no `env` list for any env-gated file in this app). |
| Runtime harness | A read-only smoke check (throwaway script, deleted after use — see below) confirmed `DAYTONA_GAME_SNAPSHOT` (already set by the user in `.env.local` and in Trigger.dev's environment variables, per the apply prompt) resolves against the real Daytona API: `daytona.snapshot.get(name)` returned `{"name":"numa-chromium-game-2026-09-11T17-55","state":"active","size":1.4090952454134822}` — name matches exactly, state `active`, size ~1.41 GiB matching the spike report. No sandbox or snapshot was created by this apply session. Manual scenario for the user, per tasks.md's own row for this unit: with `DAYTONA_GAME_SNAPSHOT` on, create a new game in dev and confirm `createGameSandbox` provisions from the snapshot (the sandbox carries `hasChromium: "true"`) with no meaningful start-time regression versus before, per the spike's own criterion 2 (delta was within noise, snapshot sandboxes even started slightly faster in the spike's run). |
| Rollback boundary | Revert `lib/daytona/game-image.ts`, `scripts/build-game-snapshot.ts`, and the diffs in `lib/daytona/utils.ts`, `package.json`, `tsconfig.json`; unset `DAYTONA_GAME_SNAPSHOT`. `createGameSandbox`'s fallback path (`daytona.create({ labels: { [GAME_LABEL]: gameId } })`, no `snapshot`) is byte-identical to what it called unconditionally before this unit, so a revert — or simply unsetting the env var without reverting the code — restores today's exact sandbox-creation behavior. No other unit's code imports `game-image.ts`, `CHROMIUM_LABEL`, or `createSandboxForGame` yet (unit 6's verifier is the first planned reader of `CHROMIUM_LABEL`). |

### Deviations from Design

1. **`CHROMIUM_LABEL` (`hasChromium`), a new sandbox label not named in any
   task or design text, was added and justified from design.md's own
   requirement.** Decision 13 / line 97 says a sandbox with no Chromium must
   report `verify`'s result as `status: "unavailable"`; Deviation 2 says
   "verification only covers sandboxes created from the new snapshot; older
   games report unavailable." Neither says how unit 6's verifier is meant to
   tell an old sandbox apart from a new one before running anything. The
   apply prompt for this unit explicitly invited this: "If unit 6 needs a
   way to know whether a sandbox has Chromium ... add that small hook here
   and justify it from the design text." Probing every `verify` call by
   trying to launch Chromium and seeing whether it exists would burn a full
   sandbox round trip just to learn a fact that never changes for a
   sandbox's lifetime, and would conflate "no Chromium installed" with any
   other Chromium-launch failure the check might legitimately need to
   report as a normal `fail`. A label stamped once, at creation, lets unit
   6 read `sandbox.labels?.[CHROMIUM_LABEL] === "true"` for free — it is
   already fetching the sandbox for every other reason `verify` needs it.
   Only `createSandboxForGame`'s snapshot-create branch sets it; the
   env-unset path and the post-failure fallback both omit it, so an old
   sandbox (or a sandbox from a failed snapshot create) reads as falsy by
   construction, with no separate "false" value ever needing to be written.
2. **`tsconfig.json` gained `allowImportingTsExtensions: true`, not named in
   any task.** Task 5.2 asked to "check how `apps/web` package.json
   `type`/module settings affect running a `.ts` file with `node
   --env-file=.env.local`" and to keep `tsc --noEmit` passing. Verified
   directly (see Issues Found for the exact commands run): Node 26's native
   type-stripping resolves a relative TypeScript import only when the
   specifier carries the literal `.ts` extension — an extension-less
   specifier (the convention every other file in this app already uses,
   resolved by Next.js's bundler) fails with `ERR_MODULE_NOT_FOUND` under
   plain `node`, and a `.js`-referring-to-`.ts` specifier (the common
   `tsx`/`ts-node` convention) fails the same way, because nothing in this
   project performs that remapping at runtime. `tsc`'s default `moduleResolution:
   "Bundler"` (inherited from `@workspace/typescript-config/nextjs.json`)
   rejects a literal `.ts` import specifier with `TS5097` unless this flag
   is set; the flag requires `noEmit`, already `true` project-wide. Scoped
   to `apps/web/tsconfig.json` (not the shared `typescript-config` package),
   so it affects only this app, only permits an explicit `.ts` extension
   where one is written, and forces no other file in the app to change how
   it imports.
3. **`build-game-snapshot.ts` is not itself included in unit 5's spike
   image or its own resource spec beyond what the spike already
   validated** — it is a thin CLI wrapper around
   `daytona.snapshot.create({ image, resources })`, deliberately kept free
   of any logic the spike did not already exercise (the image definition,
   the exact resource shape). This is not a deviation from any task wording,
   but is worth stating: nothing in this script was run against the real
   Daytona API during this apply (per the apply prompt's explicit
   instruction not to rebuild the snapshot or run the build script against
   the real account) — only its `tsc`/`eslint` checks and the separate,
   read-only smoke script were run.

None of these change what `game-verification`'s Behavior When the Verifier
Is Unavailable requirement (sandbox-provisioning half) asks for; all are
implementation-level consequences of running a build script under plain
`node` in a project with no TS runner, and of unit 6 needing a cheap way to
answer a question this unit's own sandboxes already have the answer to at
creation time.

### Issues Found

1. **Confirmed by direct experiment, not assumption: Node 26's relative-TS-import
   resolution is stricter than this project's existing import convention.**
   Three things were tried and recorded before settling on the shipped
   approach: (a) `import ... from "../lib/daytona/client"` (this app's usual
   extension-less style) → `ERR_MODULE_NOT_FOUND` under plain `node`,
   despite `tsc --noEmit` accepting it silently; (b) `import ... from
   "../lib/daytona/client.ts"` → runs correctly under `node`, but `tsc
   --noEmit` rejects it with `TS5097` under this project's default
   `moduleResolution: "Bundler"`; (c) `import ... from
   "../lib/daytona/client.js"` (referring to a `.ts` file, the `tsx`/`ts-node`
   convention) → `tsc --noEmit` accepts it, but `node` still fails with
   `ERR_MODULE_NOT_FOUND`, because nothing in this project (no `tsx`, no
   compiled output) performs that `.js`→`.ts` remap at runtime. Option (b)
   plus `allowImportingTsExtensions` (Deviation 2) is the only one of the
   three that both runs and typechecks; it was verified working end to end
   by running the read-only smoke script through the actual `pnpm
   --env-file` invocation shape task 5.2 specifies.
2. **`Image.d.ts`/`Snapshot.d.ts` (installed `@daytona/sdk` 0.211.2) were
   read directly to confirm the spike's own claim** — `CreateSnapshotParams`
   does carry an optional `resources?: Resources` field (used by
   `build-game-snapshot.ts`), and `CreateSandboxFromSnapshotParams` (used by
   `createGameSandbox`, via `CreateSandboxBaseParams & { snapshot?: string
   }`) does not, confirming the spike's "sandboxes inherit the snapshot's
   resources" note rather than assuming it.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 8 of 15)
- Current work unit: 5 — Chromium snapshot (gated)
- Boundary: starts from `agent-harness/4-parallel`, ends with
  `createGameSandbox` able to provision from the pre-built Chromium
  snapshot when `DAYTONA_GAME_SNAPSHOT` is set (already true in this repo's
  `.env.local` and Trigger.dev environment, per the apply prompt), falling
  back to today's default sandbox both when the env var is unset and when a
  configured snapshot fails to resolve; no other unit's code depends on
  anything in this slice yet (unit 6 is the first planned reader of
  `CHROMIUM_LABEL`)
- **Authored changed lines: 190** (187 insertions + 3 deletions across 5
  files — 2 new plus `utils.ts`, `package.json`, `tsconfig.json` — per `git
  diff --cached --stat`, excluding `openspec/**` and the pre-existing
  unrelated `apps/web/next.config.ts` diff, which was never staged this
  session). Well **under the 400-line budget** — consistent with unit 2b
  (230), the other unit in this change that shipped under budget — because
  this unit wires one image definition, one thin CLI script, and one
  fallback branch in an already-small function, rather than a new subsystem.

### Status

3/3 tasks in unit 5 complete. Ready for `sdd-verify`. Report the new
`CHROMIUM_LABEL` hook (Deviation 1, for unit 6 to consume) and the
`allowImportingTsExtensions` tsconfig change (Deviation 2) to the
user/maintainer. Per the interactive pace instruction, this batch stops
here; unit 6 (verify role) is a separate apply and depends on this unit's
`CHROMIUM_LABEL` and the confirmed-resolving `DAYTONA_GAME_SNAPSHOT`.

## Unit 6 — Verify role (PR 9)

Branch: `agent-harness/6-verify-role` (stacked on
`agent-harness/5-chromium-snapshot`).

- [x] 6.1 Create `apps/web/lib/daytona/verify-script.ts`
- [x] 6.2 Create `apps/web/lib/daytona/verify.ts`
- [x] 6.3 Create `apps/web/lib/games/harness/tools/verify.ts`
- [x] 6.4 Create `apps/web/lib/games/instructions/roles/verifier.ts`

4/4 tasks in unit 6 complete. Units 7a–10b remain (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/daytona/verify-script.ts` | Created |
| `apps/web/lib/daytona/verify.ts` | Created |
| `apps/web/lib/games/harness/tools/verify.ts` | Created |
| `apps/web/lib/games/instructions/roles/verifier.ts` | Created |
| `apps/web/lib/games/harness/turn-state.ts` | Modified — new `verifyBaseline` field/accessors |
| `apps/web/trigger/chat.ts` | Modified — `verify` declared, gated, wired |
| `apps/web/lib/games/tool-parts.ts` | Modified — `verify` tool label |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (all three packages). `pnpm lint` run directly inside `apps/web` → 0 errors, the same 13 pre-existing warnings established as the baseline since unit 5 (12 from unit 2a onward, plus `DAYTONA_GAME_SNAPSHOT`'s `turbo/no-undeclared-env-vars`). No new warning from any file this unit touched. |
| Runtime harness | N/A in this apply session — requires an interactive dev session with `HARNESS_PHASES` on and a live Daytona sandbox provisioned from the Chromium snapshot, neither of which is available to a headless apply run. `HARNESS_PHASES` stays off, so `verify` is declared on `chat.agent({ tools })` but excluded from every real turn's `activeTools`, same as `explore`/`run_tasks`. Manual scenario for the user, per tasks.md's own row for this unit: seed a `pageerror` in a dev game's sandbox (e.g. temporarily add a `setTimeout` throw to a game file, matching the unit 5 spike's own `SEED_ERROR` technique), set `HARNESS_PHASES=true`, dispatch `verify` and confirm (a) the console error is categorized as turn-caused (no baseline yet, so every error counts as caused, per design.md), (b) the tool's rendered envelope text begins `"Verify result: FAIL."`, (c) a corrective `run_tasks` pass that removes the seeded throw followed by a second `verify` call in the same turn reports `"Verify result: PASS."`, and (d) a third `verify` call in that same turn is refused without running anything (`outcome: "refused"`, no sandbox round trip). A second scenario: run `verify` against a sandbox created before `DAYTONA_GAME_SNAPSHOT` existed (no `hasChromium` label) and confirm it reports `"Verify result: UNAVAILABLE."` without attempting to launch Chromium. |
| Rollback boundary | Revert the four new files, the `turnState.verifyBaseline` field/accessors, and the `verify` wiring in `trigger/chat.ts`/`tool-parts.ts`. `HARNESS_PHASES` already gates `verify` out of every real turn's `activeTools`, so the revert changes nothing a live turn could observe either way — the same self-contained shape units 2b/3/4/5 each documented for their own additive wiring. `turnState.verifyBaseline` is new and unread by anything outside `tools/verify.ts`, so removing it alongside is safe. |

### Deviations from Design

1. **`trigger/chat.ts` and `lib/games/tool-parts.ts` are touched, though
   design.md's File Changes table lists only the four Create rows for unit
   6.** The same kind of scope gap units 1c and 3 each documented for their
   own file lists: a dispatch tool that is never declared on
   `chat.agent({ tools })` and never added to `PHASE_TOOLS` is unreachable —
   `explore` (unit 2b) and `run_tasks` (unit 3) both needed the identical
   wiring in these same two files, and the orchestrator's own apply prompt
   for this unit explicitly named both files and pointed at unit 2b's wiring
   as the pattern to follow. Both diffs are the same shape as unit 2b's own:
   one import, one `tools` factory entry, one `PHASE_TOOLS` addition, one
   `TOOL_LABELS` entry — no other behavior in either file changed.
2. **The console-error baseline is frozen for the whole turn in
   `turnState.verifyBaseline`, read once from the sandbox's
   `.numa/verify/last.json` on the turn's first `verify` call, rather than
   re-read from the file on every call.** Neither task 6.1 nor 6.2 names this
   explicitly — task 6.1 only says the script "diffs against
   `.numa/verify/last.json`" — but the script also has to keep that same file
   current for the NEXT turn (so a future turn's own first check has an
   accurate "before this turn" baseline), and those two needs conflict within
   ONE turn: the script unconditionally overwrites `last.json` with its own
   run's result every time it runs. Without freezing, a corrective retry's
   own categorization would diff against the FIRST call's just-written
   result — which still contains the very error the retry was meant to fix —
   so a still-broken, still turn-caused error would misclassify as
   "pre-existing" on the second call, silently reporting `pass` when the game
   still does not work. Traced through by hand before writing any code (see
   the header comment on `TurnStateData.verifyBaseline` in `turn-state.ts`
   and `readVerifyBaseline`'s own comment in `lib/daytona/verify.ts` for the
   full reasoning); this is the one piece of unit 6 where getting the
   mechanism wrong would have silently broken the spec's own "Honest
   Reporting After Retry" scenario rather than failing loudly.
3. **The verify script's dynamic inputs (the game's port, the frozen
   baseline, and both `.numa/verify/` paths) cross into the fixed Python
   source through `process.executeCommand`'s `env` parameter, never through
   string interpolation into the script body.** Task 6.1's own wording
   ("constants only, no interpolated model/player text") is about not
   injecting untrusted text into the script's SOURCE; an env var carrying
   harness-controlled values (never model or player text) is the same
   technique the unit 5 spike's own `SEED_ERROR` env var already used and
   validated, not a new risk this unit introduces.
4. **`harness/tools/verify.ts` defines its own `VerifyOutcome` type
   (`"pass" | "fail" | "unavailable" | "refused"`), a strict superset of
   `lib/daytona/verify.ts`'s `VerifyStatus` (`"pass" | "fail" |
   "unavailable"`, task 6.2's own return type).** `refused` is this tool's
   own outcome for the 2-calls-per-turn cap (task 6.3) — a call that never
   reached `lib/daytona/verify.ts` at all, so it does not belong on that
   module's own status type.
5. **`lib/daytona/verify.ts` declares a local `VerifyFinding` type
   (`{ message, severity }`, no `taskId`) instead of importing
   `harness/envelope.ts`'s `Finding`.** `lib/daytona` is infrastructure;
   keeping it free of any `lib/games` import (parallel to the `lib/ai` ↔
   `lib/games` boundary `pricing.ts` and `envelope.ts` already document) means
   `harness/tools/verify.ts` — which already imports both modules — is the
   one place that widens a `VerifyFinding[]` into a real `Finding[]`
   (`toFindings`), not `lib/daytona/verify.ts` itself. `taskId` stays unset on
   every finding this unit produces: mapping a console error back to the task
   that owns the file it concerns (design.md's Data Flow: "findings→owner
   task") needs `.numa/tasks.json` (unit 8's `submit_plan`), which does not
   exist yet — the same forward-declaration gap unit 3's `TaskSpec.skills`
   and unit 1b's `AgentUsageEntry.role` each documented for their own
   not-yet-built dependencies.
6. **The verifier's own additional finding is detected by exact string
   comparison against `NO_ADDITIONAL_FINDINGS`, not by parsing structured
   output.** The role catalogue gives the verifier no tools at all (design.md:
   "verifier | ... | strong | none"), so there is no `submit_finding`-style
   tool call to structure its answer with — its whole result is free text,
   the same shape `explorerInstructions`/`workerInstructions` already produce
   for their own roles. `roles/verifier.ts` and `tools/verify.ts` share one
   exported constant for the exact "nothing to add" sentence, so the prompt
   and the code can never drift apart on what counts as "nothing to add."
   This is the deterministic mechanism behind task 6.4's "model may only add
   visual findings, never clear a code-decided console verdict": the code
   never removes or edits a code-decided finding, and only ever appends the
   verifier's own reply as one more finding, never uses it to change
   `outcome`.
7. **"Never Claim Success Without Running Verify" and the "Honest Reporting
   After Retry" reply-composition half of that requirement are not enforced
   by any file in this unit.** Both are, in the end, about what the
   ORCHESTRATOR's own final reply says — no file design.md's Unit 6 File
   Changes row names, and none of this unit's four tasks, touches the
   orchestrator's own instructions (`instructions/workflow.ts`,
   `instructions/index.ts`). What this unit delivers is the mechanical
   foundation those two requirements need to be satisfiable at all: `verify`
   only ever reports a code-decided `outcome` a real check produced (never a
   model's own claim), and a corrective retry's `fail` genuinely stays `fail`
   when the underlying error persists (Deviation 2 above) — so the
   information an honest reply would need is always available to the
   orchestrator's model. Whether the orchestrator's own prompt actually
   instructs it to use that information honestly is a later unit's prompt
   work, not a unit 6 code guarantee.

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 9 of 15)
- Current work unit: 6 — Verify role
- Boundary: starts from `agent-harness/5-chromium-snapshot`, ends with a
  working `verify` dispatch tool — deterministic console-error check plus a
  visual-review sub-agent, budget-capped at 2 calls per turn — declared on
  `chat.agent({ tools })` and narrowed out of every real turn by
  `activeTools` while `HARNESS_PHASES` stays off; `explore`'s and
  `run_tasks`' own paths (units 2b/3/4) are unaffected — neither file either
  imports from touches anything `verify`-specific
- **Authored changed lines: 640** (629 insertions + 11 deletions across 7
  files — 4 new plus `turn-state.ts`, `trigger/chat.ts`, `tool-parts.ts` —
  per `git diff --cached --stat`, excluding `openspec/**` and the
  pre-existing unrelated `apps/web/next.config.ts` diff, which was never
  staged this session). This is **over the 400-line budget**, consistent
  with every other unit in this change except 2b and 5. It was implemented
  honestly rather than trimmed: the fixed Python script
  (`verify-script.ts`, 154 lines) and the TypeScript check runner
  (`verify.ts`, 186 lines) are both genuinely new logic — a headless-browser
  check, a turn-frozen baseline diff, and the code/model split decision 13
  requires — and the codebase's existing block-comment density was
  preserved/extended, including the load-bearing reasoning behind Deviation
  2 above, which a reviewer checking a spec-correctness property (not
  reportable success after a failed retry) needs to verify the mechanism is
  actually sound. **Recommendation: `size:exception` for this slice**,
  consistent with every over-budget unit already shipped in this change.

### Status

4/4 tasks in unit 6 complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk, the `trigger/chat.ts`/`tool-parts.ts`
scope gap (Deviation 1), the turn-frozen-baseline mechanism (Deviation 2 —
worth a maintainer's own read, since it is the one place this unit could
have silently shipped a spec violation), and the reply-composition gap
(Deviation 7, for whichever unit next touches `instructions/workflow.ts`) to
the user/maintainer. Runtime harness is explicitly N/A per the apply
prompt's own instruction — it requires an interactive dev session with
`HARNESS_PHASES` on, not available to this headless apply run. Per the
interactive pace instruction, this batch stops here; unit 7a (skills
registry) is a separate apply.

## Unit 7a — Skills registry + skill files (PR 10)

Branch: `agent-harness/7a-skills-registry` (stacked on
`agent-harness/6-verify-role`).

- [x] 7a.1 Create `apps/web/lib/games/skills/registry.ts`
- [x] 7a.2 Create `apps/web/lib/games/skills/engine-*.ts` (8 files)

2/2 tasks in unit 7a complete. Units 7b–10b remain (`[ ]`), unassigned to
this apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/skills/registry.ts` | Created |
| `apps/web/lib/games/skills/engine-core.ts` | Created |
| `apps/web/lib/games/skills/engine-utils.ts` | Created |
| `apps/web/lib/games/skills/engine-movement.ts` | Created |
| `apps/web/lib/games/skills/engine-scene.ts` | Created |
| `apps/web/lib/games/skills/engine-feedback.ts` | Created |
| `apps/web/lib/games/skills/engine-audio.ts` | Created |
| `apps/web/lib/games/skills/engine-systems.ts` | Created |
| `apps/web/lib/games/skills/engine-reference.ts` | Created |

### The 8-way split and its lossless verification

`instructions/engine.ts`'s body has 4 explicit `###` sections but 13 named
toolkit modules (`engine.js` through `index.js`) inside the biggest one, so
the 8 split points were chosen by grouping those modules along the
document's own existing order — never reordered — into 8 contiguous,
role-shaped chunks:

| Skill | Source content (in original order) | Source lines |
|---|---|---|
| `engine-core` | Intro, "Loading it", `engine.js` | 21–84 |
| `engine-utils` | `math.js`, `input.js` | 86–99 |
| `engine-movement` | `controls.js`, `physics.js` | 101–118 |
| `engine-scene` | `lighting.js`, `models.js` | 120–133 |
| `engine-feedback` | `anim.js`, `hud.js` | 135–149 |
| `engine-audio` | `sound.js` | 151–157 |
| `engine-systems` | `fx.js`, `state.js`, `index.js` | 159–175 |
| `engine-reference` | "The shape of a game", "Making it look good" | 177–245 |

`engine-core` is named to match design.md's own role-catalogue reference
("roles/planner, runtime, **engine-core**, skill index") and its unit-8
File Changes row ("orchestrator skills cut down to **engine-core**").

**Lossless-move verification method**: before writing any `.ts` file, a
script read `engine.ts`'s raw lines, sliced the exact 8 line ranges above
(special-casing line 21's `  content: \`` prefix and line 245's trailing
`` `, `` suffix, the two lines where the template literal's delimiters
share a physical line with content), and reconstructed the full body by
joining the 8 slices with `"\n\n"` — the same single blank line that
separates every section in the original (confirmed blank at source lines
85, 100, 119, 134, 150, 158, 176, one each, no doubles). The reconstruction
was then diffed byte-for-byte against the original body extracted the same
way: `diff original.txt reconstructed.txt` reported no differences, and a
direct Python string-equality check (`reconstructed == orig_body`) was
`True` at 10,397 characters in both. Only after this passed did the
extracted per-group text get pasted, unedited, into each `engine-*.ts`
file's `body` template literal — the moved text (all escaped backticks and
code fences) is identical to what `engine.ts` already had; only the
wrapping `Skill` object literal, `name`, `description`, and `trigger`
fields are new.

`description` and `trigger` are new text this task added (the spec
requires both to be non-empty; `engine.ts` had neither, since it was one
undifferentiated always-loaded block) — not moved, and not claimed as such
in each file's own header comment.

### Deviations from Design

1. **`ROLE_DEFAULT_SKILLS`'s exact per-role skill lists are this unit's own
   choice, not dictated verbatim by design.md or tasks.md.** Design.md's
   role catalogue explicitly names only one skill by name — `planner` gets
   `engine-core` — and otherwise says workers get "defaults ∪ task skills"
   without enumerating the defaults themselves; `agent-skills`'s
   Deterministic Role Defaults requirement only asks that a role's defaults
   be fixed and reproducible, not what they contain. `registry.ts` assigns
   `gameplay` → core+utils+movement+systems, `visuals` →
   core+scene+feedback+systems+reference, `audio` → core+audio, and
   `explorer`/`verifier` → none (neither writes engine code: the explorer is
   read-only and the verifier has no tools at all). This is documented
   in-line in `registry.ts`'s own comment above `ROLE_DEFAULT_SKILLS` with
   the reasoning per role, precisely so the maintainer can adjust the
   mapping before unit 7b wires it into worker instructions without
   needing to re-derive the reasoning from scratch.
2. **`ORCHESTRATOR_DEFAULT_SKILLS` (all 8 skill names) is defined here**,
   even though no task in 7a asks for it, because design.md's File Changes
   table for unit 7 states the orchestrator "keeps all engine skills pushed
   until unit 8" and unit 7b's own task list (7b.3) is the wiring step that
   will read this constant. Defining it now, next to the skills it
   enumerates, avoids a second unit needing to know which constant name
   `ALL_SKILL_NAMES` maps to for that purpose. Nothing imports this file
   yet (no wiring happens until 7b), so it has no runtime effect in this
   PR.
3. **`isSkillName` (a registry-owned type guard) is new**, not named in any
   task, added because 7b.1's `load_skill` tool (unit 7b, not this unit)
   will need exactly this check to satisfy `agent-skills`'s Unknown Skill
   Name Returns an Error requirement, and the registry — not the tool file
   — is the natural owner of "what counts as a known skill name." It has no
   caller yet.

None of these change what `agent-skills`'s Registry Entry Shape or
Deterministic Role Defaults requirements ask for; both are
implementation-level scaffolding this unit's own two tasks needed to
produce a registry that compiles and that unit 7b can wire in without
redesigning it.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (`web`, `@workspace/ui` cache-hit, `@workspace/db` cache-hit, all unchanged). `pnpm lint` run directly inside `apps/web` → 0 errors, the same 13 pre-existing warnings (11 from before unit 2a plus `HARNESS_PHASES`'s and `DAYTONA_GAME_SNAPSHOT`'s `turbo/no-undeclared-env-vars`, both introduced by earlier units, none by this one). No new warning from any of the 9 new files. |
| Runtime harness | N/A, per tasks.md's own row for this unit: no role instructions import `registry.ts` or any `engine-*.ts` file yet — `instructions/index.ts` and `instructions/engine.ts` are both untouched, so every existing turn's system prompt is byte-identical to before this unit. There is nothing a dev session could exercise differently. |
| Rollback boundary | Revert the entire new `apps/web/lib/games/skills/` directory (9 files). Nothing outside this directory imports any of them — `instructions/engine.ts` still exists unmodified and `instructions/index.ts` still builds the prompt the same way it did before unit 7a — so the revert is fully self-contained and changes no other unit's behavior. |

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 10 of 15)
- Current work unit: 7a — Skills registry + skill files
- Boundary: starts from `agent-harness/6-verify-role`, ends with a
  compiling, typed skills registry and 8 lossless skill files that nothing
  yet imports; `instructions/engine.ts` still exists and is still the
  prompt's only engine reference (unit 7b deletes it and wires the
  registry in)
- **Authored changed lines: 476** (476 insertions, 0 deletions, across 9
  new files, per `git diff --cached --stat`; excludes `openspec/**` and the
  pre-existing unrelated `apps/web/next.config.ts` diff, which was never
  staged this session). This is **over the 400-line budget**, by the
  smallest margin of any unit in this change so far (the next-closest was
  2b, which stayed under). The overage is a direct, documented consequence
  of tasks.md's own 7a/7b split: 7a only *creates* the 8 skill files and the
  registry, and 7b (a separate PR) is the one that *deletes*
  `instructions/engine.ts`, so this slice necessarily carries the full
  moved-text weight as pure addition with no offsetting deletion — the
  duplication is temporary and by design, not a sign the split should have
  gone the other way (creating without wiring, then wiring-and-deleting
  together, is what keeps each of the two PRs independently revertible,
  per tasks.md's own rollback-boundary column for 7a and 7b). No line was
  trimmed to chase the budget: the moved bodies are byte-identical to
  `engine.ts`'s text (see the lossless-verification method above), and the
  per-file header comments and `registry.ts`'s role-mapping rationale are
  load-bearing documentation a reviewer needs to check the split was done
  correctly and to adjust `ROLE_DEFAULT_SKILLS` before 7b wires it in.
  **Recommendation: `size:exception` for this slice**, consistent with
  every over-budget unit already shipped in this change (1a, 1b, 1c, 2a,
  6).

### Status

2/2 tasks in unit 7a complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk (smallest overage in the change so far,
and structurally unavoidable given the 7a/7b split) and the
`ROLE_DEFAULT_SKILLS` per-role mapping (Deviation 1 — an executor judgment
call, not a design.md-dictated list) to the user/maintainer before merge.
Per the interactive pace instruction, this batch stops here; unit 7b
(`loadSkill` tool + wiring) is a separate apply.

## Unit 8 — Size routing + phase flow (PR 12)

Branch: `agent-harness/8-phase-flow` (stacked on
`agent-harness/7b-load-skill`).

- [x] 8.1 Create `apps/web/lib/games/harness/tools/plan.ts` + `plan-store.ts`
- [x] 8.2 Create `apps/web/lib/games/instructions/roles/planner.ts`
- [x] 8.3 Modify `apps/web/lib/games/instructions/workflow.ts`
- [x] 8.4 Modify `apps/web/lib/games/harness/flags.ts`
- [x] 8.5 Modify `apps/web/lib/games/instructions/index.ts`

5/5 tasks in unit 8 complete. Units 9–10b remain (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/harness/task-spec.ts` | Created |
| `apps/web/lib/games/harness/plan-validation.ts` | Created |
| `apps/web/lib/games/harness/plan-store.ts` | Created |
| `apps/web/lib/games/harness/tools/plan.ts` | Created |
| `apps/web/lib/games/instructions/roles/planner.ts` | Created |
| `apps/web/lib/games/harness/tools/run-tasks.ts` | Modified |
| `apps/web/lib/games/harness/run-subagent.ts` | Modified |
| `apps/web/lib/games/harness/flags.ts` | Modified |
| `apps/web/lib/games/skills/registry.ts` | Modified |
| `apps/web/lib/games/instructions/index.ts` | Modified |
| `apps/web/lib/games/instructions/workflow.ts` | Modified |
| `apps/web/trigger/chat.ts` | Modified |
| `apps/web/lib/games/tool-parts.ts` | Modified |

### Deviations from Design

1. **`taskSpecSchema`/`TaskSpec` moved out of `run-tasks.ts` into a new,
   dependency-light `harness/task-spec.ts`, rather than duplicated.** The
   apply prompt explicitly asked to reuse `run_tasks`' own schema for the
   plan's task list. Importing it directly from `run-tasks.ts` would have
   pulled in that file's own import chain — `harness/ownership.ts` →
   `lib/games/tools.ts` → `lib/daytona/utils.ts` → `@workspace/db`, whose
   `client.ts` calls `parseEnv(...)` at module-import time and throws when
   `DATABASE_URL` is absent — into a validator meant to be a pure structural
   check with no sandbox or database in the loop (needed for this unit's own
   standalone-validator verification requirement). `task-spec.ts` has none of
   that: zod plus the skills registry's own plain data. `run-tasks.ts` now
   imports `taskSpecSchema`/`TaskSpec`/`rejectDuplicateTaskIds` from it
   instead of declaring them itself; nothing else imported them from
   `run-tasks.ts` before this change (confirmed by search), so this is a pure
   move, not a breaking rename.
2. **The duplicate-task-id check (`rejectDuplicateTaskIds`) also moved to
   `task-spec.ts`**, shared by `run_tasks`' own `tasksArraySchema` (max 4)
   and `submit_plan`'s `planTasksSchema` (max 6, `plan-validation.ts`) —
   both key their own bookkeeping by task id and need the identical check,
   rather than two copies that could drift.
3. **`dependsOn` cycle detection did not already exist as a reusable
   function**, despite the apply prompt's "may already exist there — reuse
   it" hedge. `run_tasks`' own scheduler (unit 3/4) discovers an
   unsatisfiable dependency — cycle included — only as a side effect of
   never being able to start it, which is sufficient for a runtime scheduler
   but never names the cycle for a pre-dispatch validator to explain to the
   model. A standalone three-color DFS (`findDependencyCycle`) was written
   in `plan-validation.ts` for `submit_plan` specifically, alongside
   `findUnknownDependency` (an id with no matching task in the same
   submission — a fresh plan has no earlier `run_tasks` call this turn to
   reference, unlike `run_tasks`' own cross-call `dependsOn`) and
   `findUnresolvedOwnershipOverlap` (transitive-dependency-aware pairwise
   ownership check, design.md's "disjoint ownership outside dependency
   chains").
4. **`ownershipOverlaps`/`entriesConflict` and the protected-prefix name list
   are duplicated in `plan-validation.ts` rather than imported from
   `harness/ownership.ts`/`lib/games/tools.ts`**, for the identical reason as
   Deviation 1: both of those modules transitively import the Daytona/DB
   client chain through `lib/games/tools.ts`. The duplicated logic is three
   short, pure string-comparison functions with no independent behavior of
   their own to drift — the same category of duplication `run-tasks.ts` and
   `tool-parts.ts` already document for `WRITE_TOOL_NAMES`/`MUTATING_TOOLS`.
5. **`submit_plan`'s validation is split across two layers**, not entirely
   inside `execute` as task 8.1's single sentence might suggest: task count,
   known roles/skills and duplicate ids are enforced by `planTasksSchema`
   itself (zod, reusing `taskSpecSchema` — the same layer `run_tasks`' own
   duplicate-id check already uses, unit 3); the cross-task graph checks
   (acyclic `dependsOn`, protected ownership, disjoint ownership outside
   dependency chains) cannot be expressed as a static schema and are checked
   explicitly inside `execute` via `validatePlanTasks`, returning `{ error }`
   per design.md's own wording. Both layers reach the planner as a
   correctable tool-input problem inside its own loop either way.
6. **`stopWhen` is now an optional override on `RunSubagentInput`
   (`run-subagent.ts`)**, not a file task 8's own list names, because the
   SDK's own `hasToolCall` — the literal function design.md's role catalogue
   names ("12, or `hasToolCall(\"submit_plan\")`") — stops the loop on ANY
   call to the named tool, success or failure alike (confirmed against the
   installed `ai@7.0.93`'s implementation: it checks only `steps[-1].toolCalls`,
   never their results). Using it verbatim would have ended the planner's run
   on its very first rejected `submit_plan` attempt, before the model ever
   saw its own `{ error }` to react to — directly defeating design.md's own
   "so the planner corrects itself in its own loop" for `submit_plan`. Fixed
   by giving `run-subagent.ts` an optional `stopWhen` parameter (default
   unchanged: `stepCountIs(role.maxSteps)` alone, so every other role and
   every existing caller is unaffected) and having `plan.ts` pass
   `[stepCountIs(role.maxSteps), planSubmitted()]`, where `planSubmitted()`
   checks the last step's `submit_plan` tool RESULT rather than merely its
   call. This is a corrected reading of the design's own intent, not a
   deviation from it: the behavior it names (stop once the plan is genuinely
   accepted, not merely attempted) is preserved; only the literal function
   reference is not, because using it as named would have shipped a bug.
7. **The plan's task list is carried inside the envelope's `summary` as
   JSON**, not a new field on `SubagentEnvelope`. Design.md's Data Flow
   diagram shows `envelope{tasks:[id,role,title,owns,dependsOn,skills]}` for
   `plan`, but the Interfaces section's own `SubagentEnvelope` type is fixed
   (`agent`, `status`, `summary`, `edits?`, `artifacts?`, `findings?`) with no
   `tasks` field, and no task in this unit's own list asks to widen it. This
   mirrors `run-tasks.ts`'s own `renderOutcomes`, which already serializes a
   batch's outcomes into `summary` the same way; `artifacts` names the two
   files `.numa/design.md`/`tasks.json` a successful plan wrote.
8. **`run_tasks` was not modified to cross-check a task's `owns` against
   `.numa/tasks.json`** (design.md's Data Flow: "check disjoint + deps + owns
   ⊆ tasks.json"). This unit's own five tasks (8.1–8.5) do not list
   `run-tasks.ts` for this check, and the apply prompt's scope section did
   not extend it there either — flagged here as a real gap between the
   design's data-flow diagram and tasks.md's own unit 8 task list, worth
   resolving explicitly (either as a `run_tasks` task in a later unit, or a
   documented decision that `run_tasks` remains callable independently of
   `plan`, matching decision 8's own "Calling plan is the route" wording,
   which reads as advisory rather than code-enforced).
9. **The "Question Behavior Based on Message Specificity" half of task 8.3
   needed no new text.** `instructions/workflow.ts`'s existing `ask_player`
   section (predating this unit) already covers both of the spec's own
   scenarios verbatim in substance — building as soon as a message names a
   kind of game, and capping clarifying questions at two for an undecided
   one — so nothing was added or changed there; only the new "Sizing a
   change: tweak or build" section is new text for this unit.

None of these change what `agent-orchestration`'s Size Routing, Fixed Phase
Order or Question Behavior requirements ask for, or what `file-ownership`'s
Engine/Vendor Protections Preserved (plan half) asks for; all are
implementation-level consequences of building `submit_plan`'s validator to
be both correct and standalone-testable, and of a literal reading of
`hasToolCall` that would have shipped a real bug.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (`web` fresh; `@workspace/ui`/`@workspace/db` cache-hit, unchanged by this unit). `pnpm lint` run directly inside `apps/web` → 0 errors, the same 13 pre-existing warnings established as the baseline since unit 7a/7b (including `HARNESS_PHASES`'s own `turbo/no-undeclared-env-vars`, pre-existing since unit 2a). No new warning from any file this unit touched or created. |
| Standalone validator check | `node --experimental-strip-types` (Node v26.7.0) against the real `plan-validation.ts`/`task-spec.ts`/`skills/registry.ts` (copied into a temporary `apps/web/.scratch-plan-validation/` directory — deleted before this commit, confirmed absent from `git status` — with only import specifiers rewritten to relative `.ts` paths so Node's ESM resolver could find them; no logic was changed). All 8 required cases behaved as expected: `>6 tasks` (schema-rejected), `unknown role` (schema-rejected), `unknown skill` (schema-rejected), `a cycle` (`validatePlanTasks`-rejected, reporting the exact cyclic chain `t1 -> t2 -> t1`), `an engine/ owns entry` (`validatePlanTasks`-rejected), `overlapping owns without a dependency` (`validatePlanTasks`-rejected), `overlapping owns with a dependency chain` (accepted), and `a valid plan` (accepted). 8/8. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor). Manual scenario for the user, per tasks.md's own row for this unit: with `HARNESS_PHASES` on (now the default — no env var needed), send an undecided message like "make me a game" and confirm the orchestrator asks at most 2 questions before building; then send a message naming a specific, substantial game (e.g. "a tower-defense game with three enemy types and upgradable towers") and confirm the orchestrator calls `plan`, then `run_tasks` against the tasks `plan` returned, then `verify`, before replying — and confirm a small follow-up tweak in the same thread (e.g. "make the player faster") is handled directly, with no `plan` call at all. |
| Rollback boundary | Set `HARNESS_PHASES=false` to fall back to the single-loop path — the exact rollback tasks.md's own unit 8 row names. Every dispatch tool, `plan` included, stays declared on `chat.agent({ tools })` regardless (decision 6), so a stored `plan`/`submit_plan` tool-call part from a turn that ran with the flag on still re-converts correctly on a later turn with the flag off. Reverting the 13 files above independently restores unit 7b's exact end state: `ORCHESTRATOR_DEFAULT_SKILLS` back to `ALL_SKILL_NAMES`, `run-tasks.ts`'s schema back to its own local declaration, `run-subagent.ts`'s `stopWhen` back to unconditional, and `workflow.ts`/`index.ts`/`chat.ts`/`tool-parts.ts` back to their unit-7b wiring. |

### Issues Found

None.

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 12 of 15)
- Current work unit: 8 — Size routing + phase flow
- Boundary: starts from `agent-harness/7b-load-skill`, ends with `plan`
  dispatching a validated design + task list, `HARNESS_PHASES` on by
  default, and the orchestrator's own prompt routing a turn to either a
  direct tweak or the full phased flow; units 9 (run records) and 10a/10b
  (sub-agent view) are unaffected — neither reads anything this unit added
- **Authored changed lines: 998** (878 insertions + 120 deletions across 13
  files — 5 new plus 8 modified — per `git diff --stat` against
  `agent-harness/7b-load-skill`, excluding `openspec/**` and the pre-existing
  unrelated `apps/web/next.config.ts` diff, which was never staged this
  session). This is **over the 400-line budget**, and the largest overage in
  this change so far (1a: 712, 1b: 523, 1c: 569, 2a: 509, 7a: 476, 7b: 473).
  It was implemented honestly rather than trimmed: this unit is the single
  largest structural addition in the whole change — a new validated dispatch
  tool with its own sub-agent, a real DFS cycle detector and a
  transitive-dependency-aware ownership-overlap checker (both genuinely new
  logic, not boilerplate), a schema extraction that touches two files to
  avoid a database-import problem in a validator that also had to stay
  standalone-testable, and prompt/wiring changes across five more files
  (`flags.ts`, `registry.ts`, `instructions/index.ts`, `instructions/workflow.ts`,
  `trigger/chat.ts`, `tool-parts.ts`). The codebase's existing block-comment
  density was preserved and extended throughout, including the load-bearing
  reasoning behind Deviation 6 above (a real bug a literal reading of the
  design would have shipped) and the standalone-validator evidence a
  reviewer needs to trust `submit_plan`'s own correctness without running a
  live sandbox. **Recommendation: `size:exception` for this slice**,
  consistent with every other unit shipped in this change so far.

### Status

5/5 tasks in unit 8 complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk (the largest in this change so far),
Deviation 6 (the `hasToolCall` bug a literal reading of design.md's role
catalogue would have shipped) and Deviation 8 (the `run_tasks`/`tasks.json`
cross-check gap between design.md's Data Flow diagram and tasks.md's own
unit 8 task list) to the user/maintainer before merge. Per the interactive
pace instruction, this batch stops here; unit 9 (sub-agent run records) is a
separate apply.

### Fixed after parent review: `HARNESS_PHASES=false` no longer restored the single-loop prompt

The parent's review of commit `257b310` caught a real regression in the
first version of this unit's rollback path: `instructions/index.ts` built
`gameInstructions` unconditionally — `ORCHESTRATOR_DEFAULT_SKILLS` (cut to
`engine-core` alone) and the new skill-index message were both always
included, and `workflow.ts`'s own routing section ("call `plan`, then
`run_tasks`, then `verify`") was baked directly into `workflowInstructions`
itself. Setting `HARNESS_PHASES=false` correctly narrowed `activeTools` in
`trigger/chat.ts` (dropping `explore`, `plan`, `run_tasks`, `verify` and
`load_skill`), but the orchestrator's own prompt never noticed: it still
told the model to call three tools that were no longer active, still
pointed at `load_skill` as the way to reach 7 skills it could no longer
call, and never fell back to pushing every skill the way the pre-unit-8
prompt did. This broke tasks.md's own unit 8 rollback boundary ("Set
`HARNESS_PHASES` back to off; single-loop path is unchanged code") — the
code path was not, in fact, unchanged.

Fix, scoped to exactly the files the regression touched:

1. **`instructions/workflow.ts`**: the "Sizing a change: tweak or build"
   section moved out of `workflowInstructions` into its own exported
   `routingInstructions: SystemModelMessage`. `workflowInstructions` itself
   is now byte-for-byte identical to its `agent-harness/7b-load-skill`
   version (confirmed by `diff` against a `git show` extraction — no
   remaining difference at all, not even a comment).
2. **`instructions/index.ts`**: `gameInstructions` now reads `HARNESS_PHASES`
   directly. Flag off: `[workflowInstructions, runtimeInstructions,
   { role: "system", content: skillBodies(ALL_SKILL_NAMES) }]` — the exact
   three-message array, in the exact order, the prompt carried before unit 8
   existed. Flag on: `routingInstructions` and a skill-index message are
   inserted, and the skills block pushes `ORCHESTRATOR_DEFAULT_SKILLS`
   (`engine-core` alone) instead of every skill.
3. **`lib/games/skills/registry.ts`**, **`harness/flags.ts`**,
   **`trigger/chat.ts`**: updated comments that had claimed the flag-off
   path was already the unchanged single-loop path, or that `load_skill`
   unconditionally became the real path to the other 7 skills — both were
   only true when the flag is on, and now say so explicitly.

**Verification of the fix**: built `gameInstructions` from three sources —
(a) `agent-harness/7b-load-skill`'s own `instructions/index.ts` and its
dependencies, extracted via `git show` into a scratch directory; (b) this
branch's `instructions/index.ts` with `HARNESS_PHASES=false`; (c) this
branch's `instructions/index.ts` with the flag unset (on by default) — each
evaluated with `node --experimental-strip-types` (Node v26.7.0), with only
import specifiers rewritten to relative `.ts` paths (workflow.ts and
registry.ts needed no logic changes to run standalone; `runtime.ts`'s
`GAME_DIR`/`GAME_PORT` import from `lib/daytona/utils` — which pulls in
`@workspace/db`'s client, fatal without `DATABASE_URL` — was pointed at a
two-line stub carrying the same two literal values, so the real
`runtime.ts` template literal still ran unmodified). The scratch directory
was deleted before this commit; confirmed absent from `git status`.

| Build | Blocks | Length | sha256 |
|---|---|---|---|
| `agent-harness/7b-load-skill` (`gameInstructions`) | 3 | 21,321 | `ecae91f55ccc719a650afc6619dae3b1af60c286c5fc371ca2f347fe9ef98e3e` |
| HEAD, `HARNESS_PHASES=false` | 3 | 21,321 | `ecae91f55ccc719a650afc6619dae3b1af60c286c5fc371ca2f347fe9ef98e3e` |
| HEAD, `HARNESS_PHASES` unset (on) | 5 | 17,251 | `29e70a25a09b383bcec4da064f582ac095c4723a9896581d3032779ab1838670` |

The flag-off build is byte-identical to the pre-unit-8 prompt (identical
block count, length and hash). The flag-on build differs, as expected
(fewer total characters despite two more blocks, since only one skill's
body is pushed instead of eight).

`pnpm turbo typecheck --filter=web` → exit 0. `pnpm lint` (run directly
inside `apps/web`, since `pnpm turbo lint --filter=web` still pulls in the
pre-existing broken `@workspace/db#lint` task) → 0 errors, the same 13
pre-existing warnings.

**Corrected changed lines**: 187 (124 insertions + 63 deletions across 5
files — `flags.ts`, `instructions/index.ts`, `instructions/workflow.ts`,
`skills/registry.ts`, `trigger/chat.ts`; per `git diff --stat` against the
pre-fix commit, excluding `openspec/**` and `next.config.ts`), well under
the 400-line budget on its own. Committed separately from the original unit
8 commit, per the coordinator's instruction to scope this to the one fix.

## Unit 9 — Sub-agent run records (PR 13)

Branch: `agent-harness/9-subagent-records` (stacked on
`agent-harness/8-phase-flow`).

- [x] 9.1 Create `apps/web/lib/games/harness/records.ts`: client-safe
      `SubagentRunRecord` type + zod parse, `collectSubagentRuns`.
- [x] 9.2 Modify `apps/web/lib/games/harness/run-subagent.ts`: generator
      yields stamp `agentId`, role, `displayName`, tier, slot, `modelId`,
      `modelName`, steps, tool calls (name, path, ok, ≤200-char error), edits,
      tokens, skills, summary — captured even on failure/abort, capped.

2/2 tasks in unit 9 complete. Units 10a/10b remain (`[ ]`), unassigned to
this apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/lib/games/harness/records.ts` | Created |
| `apps/web/lib/games/harness/run-subagent.ts` | Modified |

### The exact record shape persisted

`subagentRunRecordSchema` (`records.ts`), field for field:

```ts
{
  agentId: string
  role: "explorer" | "planner" | "gameplay" | "visuals" | "audio" | "verifier"
  displayName: string
  tier: "pro" | "balanced" | "fast"
  slot: "strong" | "mid" | "light"
  modelId: string          // plain string, not ModelEntryId — see Deviation 4
  modelName: string        // plain string, not looked up from the registry
  status: "done" | "partial" | "blocked" | "error" | "aborted" | "skipped" | "unavailable"
  activity: string         // "current activity" one-liner, design.md decision 16
  steps: number
  toolCalls: { toolName: string; toolCallId: string; path?: string; ok: boolean; error?: string }[]
  edits: string[]
  tokens: { inputTokens: number; outputTokens: number; cachedInputTokens: number; reasoningTokens: number }
  skills: string[]
  summary: string
}
```

Every field task 9.2 lists is present: `agentId`, role, `displayName`, tier,
slot, `modelId`, `modelName`, steps, tool calls (name/path/ok/error), edits,
tokens, skills, summary. Two additions beyond that literal list, both
required by the spec or by the existing runner and called out below:
`status` (`subagent-view`'s own "final status" requirement) and `activity`
(unit 2a's pre-existing "current activity" field, kept rather than dropped).

### Deviations from Design

1. **The tool-call field is named `toolName`, not `name`** as task 9.2's
   prose lists it. Unit 2a's `SubagentProgress` shape already used
   `toolName`, and `harness/tools/run-tasks.ts`'s own `wroteAnyFile` reads
   `call.toolName` today — that file is not in this unit's task list, so the
   field keeps its existing name rather than forcing an unrelated file to
   change just to keep compiling. Semantically identical to what "name"
   asks for.
2. **`SubagentProgress` keeps its unit-2a name and is now a plain alias for
   `SubagentRunRecord`** (`export type SubagentProgress = SubagentRunRecord`
   in `run-subagent.ts`), rather than being renamed at its four import
   sites. `explore.ts`, `plan.ts`, `verify.ts` and `run-tasks.ts` all import
   it as `SubagentProgress` and are not this unit's files to touch; this
   keeps every one of them compiling unchanged against the widened shape,
   exactly the "seam this change was expected to widen" unit 2a's own
   apply-progress note anticipated.
3. **`RunSubagentInput.skills` is optional, defaulting to
   `ROLE_DEFAULT_SKILLS[role.id]`** (`lib/games/skills/registry.ts`) when a
   caller omits it. No caller passes this field today: `explore.ts` (no
   skills concept for the explorer role), `plan.ts` and `verify.ts`'s calls
   are accurate under this default (none of the three roles they dispatch
   ever takes a per-task skill extra — `ROLE_DEFAULT_SKILLS.explorer` and
   `.verifier` are both `[]`, and the planner's own `submit_plan` prompt
   never adds task-specific skills). **`run-tasks.ts`'s workers are the one
   caller this default is NOT fully accurate for**: that file already
   computes `mergeSkills(ROLE_DEFAULT_SKILLS[focus], task.skills)` for its
   own prompt-building (`buildInstructions`) but does not pass that computed
   list into `runSubagent`'s new `skills` field, since `run-tasks.ts` is not
   in this unit's task list. A worker's stamped record will therefore show
   only its role's bare defaults, not the task's own extra skills, until
   `run-tasks.ts` is updated to pass `skills: mergeSkills(...)` through —
   a one-line, additive change at its existing call site.
4. **`modelName` always reads the slot's primary's `displayName`
   (`primary.displayName`), even on a call a fallback peer actually served**
   — `modelId` correctly reads the serving entry's id (`served?.entryId ??
   primary.id`, the same pattern `AgentUsageEntry.modelId`/`onStepEnd`
   already use), but there is no way to look up a NON-primary candidate's
   display name from inside `run-subagent.ts`: `resolveModel`'s
   `ResolvedModel` only returns the primary's full `ModelEntry`, and
   `model-registry.ts`'s `REGISTRY` is a private, unexported const — adding
   an id → `ModelEntry` lookup there is a `model-registry.ts` change, and
   that file is not in this unit's task list either. Every `SlotCandidates`
   list in the current registry population holds exactly one entry
   (`model-registry.ts`'s own comment: "there are only three models to draw
   from"), so a fallback literally cannot occur yet and `served.entryId`
   will always equal `primary.id` in practice — this only becomes a real,
   user-visible inaccuracy the day a second candidate is added to some
   slot. Flagged here for whoever adds that candidate, the same way unit
   1c's own "last-server pricing" limitation was flagged for unit 2a.
5. **`records.ts` duplicates three small closed enums it needs
   (`SubagentRoleId`, `SubagentSlot`, `subagentRunStatusSchema`) rather than
   importing `RoleId`/`Slot`/`EnvelopeStatus`** from `harness/roles.ts`,
   `lib/ai/model-registry.ts` and `lib/ai/pricing.ts`/`harness/envelope.ts`.
   The apply prompt's own client-safety bar for this file ("no server-only
   imports: no Daytona, Trigger, node APIs, model providers") would already
   be satisfied by a type-only import of any of these (TypeScript erases
   `import type` completely, so no server code would reach a client
   bundle), but the codebase's own precedent
   (`lib/ai/model-catalog.ts`'s `legacyModelIdSchema` duplicating
   `model-registry.ts`'s `ModelEntryId` rather than importing it) is an
   architectural firewall by non-import, not merely a bundle-safety
   argument — `records.ts` follows that same discipline for maximum
   isolation, at the accepted cost of needing a manual update if a role or
   slot is ever added. `TierId` is the one exception: it is imported from
   `model-catalog.ts`, the explicitly-designated client-safe half of the
   tier story that `model-picker.tsx` (a client component) already imports
   today, so reusing it here crosses no new trust boundary.
6. **A mid-run (non-final) record's `status` is stamped `"partial"` and
   `summary` is `""`**, since the run's real outcome is not known until the
   stream ends or the run throws. `subagent-view`'s own shimmer-while-running
   behavior (design.md decision 16) is expected to come from the
   surrounding tool call's own streaming state (whether the SDK has already
   converted it to `output-available`), not from this field — unit 10b owns
   wiring that distinction up; this unit only guarantees the LAST record in
   `records` always carries the true final `status`/`summary` (see the
   `snapshot(status, summary)` call added right before this generator's
   `return`).

None of these change what `subagent-view`'s Sub-Agent Run Record Fields
requirement asks for on its own terms; all are implementation-level
consequences of stamping the record inside the one file this unit is
scoped to, without touching its four unmodified callers.

### Issues Found — a real gap that limits what this unit delivers today

**`run-tasks.ts` and `verify.ts` do not forward `result.records` into their
own persisted tool-output today**, so `collectSubagentRuns` will find
nothing to collect for a `run_tasks` or `verify` dispatch call, even though
`run-subagent.ts` now stamps a complete, correct `SubagentRunRecord` for
every role it runs, workers and the verifier included.

Traced exactly: `run-tasks.ts`'s `runOneTask` builds its `TaskOutcome` as
`{ taskId, envelope: result.envelope, wroteFiles: wroteAnyFile(result.records)
}` — `result.records` is read to compute a boolean, then discarded, never
attached to the outcome object itself. `verify.ts`'s final `yield` builds
`{ outcome: check.status, envelope: {...} }` — no `records` field at all,
and the `unavailable` early-return path never even calls `runSubagent`, so
there is nothing to forward there either. Only `explore.ts`'s and
`plan.ts`'s own final yields spread `RunSubagentResult` (or a copy of it)
whole, so `.records` survives into what gets persisted for those two tools.

This matters because `run_tasks` is the harness's primary game-building
dispatch tool — the worker records `subagent-view`'s own first scenario
("Record created for a completed worker") is written against are exactly
the ones that do not reach storage today. **This is not a bug in
`records.ts`/`run-subagent.ts`**: both already do everything task 9.1/9.2
ask of them, and `collectSubagentRuns`'s own structural extraction (reading
`.records`/`.outcomes[].records` off whatever shape it is handed, rather
than importing either result type) will pick these up automatically the
day `run-tasks.ts`/`verify.ts` are updated to include them — no change to
either of this unit's two files would be needed.

**Flagging this prominently for the user/maintainer**: until `run-tasks.ts`
and `verify.ts` are given the one-line addition of a `records` field on
their own outcome/result objects (each already has `result.records` in
scope at its call site), a phased turn's `games.messages` tool-output will
carry stamped run records only for `explore`/`plan` calls, not for the
`run_tasks`/`verify` calls a typical build actually spends most of its time
in. Recommend either folding this into unit 10b's own wiring work (it
already touches `tool-parts.ts`'s reload path) or landing it as a small
fast-follow before 10b, whichever the maintainer prefers.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `pnpm turbo typecheck --filter=web` → exit 0 (`web` fresh; `@workspace/ui`/`@workspace/db` cache-hit, unchanged by this unit). `pnpm lint` run directly inside `apps/web` → 0 errors, the same 13 pre-existing warnings established as the baseline since unit 7a/7b. No new warning from either file this unit touched or created. |
| Runtime harness | N/A in this apply session (no `trigger dev` run by the executor), matching tasks.md's own row for this unit ("Run a phased turn in dev, inspect the persisted `games.messages` tool-output record shape"). Manual scenario for the user: run a phased turn that dispatches `explore` or `plan` (not only `run_tasks` — see Issues Found above for why a `run_tasks`-only turn will not show this yet), then read that tool call's persisted `output.records` in `games.messages` and confirm the last entry carries `agentId`, `role`, `displayName`, `tier`, `slot`, `modelId`, `modelName`, `status`, `steps`, `toolCalls` (with `path` populated for any file tool), `edits`, `tokens` and `skills`. |
| Rollback boundary | Revert `harness/records.ts` (new) and `harness/run-subagent.ts`'s diff. `SubagentProgress`/`RunSubagentResult` keep their unit-2a names and shapes at the type level for every caller that imports them, so reverting `run-subagent.ts` alone (without touching `explore.ts`, `plan.ts`, `verify.ts` or `run-tasks.ts`, none of which this unit modified) restores the exact unit-8 runtime behavior: bare `{ activity, toolCalls: { toolName, toolCallId, ok, error } }` snapshots, no `agentId`/tier/slot/model/tokens/skills stamping. |

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 13 of 15)
- Current work unit: 9 — Sub-agent run records
- Boundary: starts from `agent-harness/8-phase-flow`, ends with
  `run-subagent.ts` stamping a complete, client-safe `SubagentRunRecord` on
  every snapshot it yields, and `records.ts` able to validate and collect
  them back out of arbitrary stored data; unit 10a's components are
  unaffected (unrendered until 10b wires them), and 10b's reload wiring is
  exactly what `collectSubagentRuns` was built to be called from — see
  Issues Found above for the one real gap that limits what is collectible
  today
- **Authored changed lines: 405** (380 insertions + 25 deletions across 2
  files — 1 new plus `run-subagent.ts` modified — per `git diff --stat`
  against `agent-harness/8-phase-flow`, excluding `openspec/**` and the
  pre-existing unrelated `apps/web/next.config.ts` diff, which was never
  staged this session). This is **5 lines over the 400-line budget** — the
  smallest overage of any unit shipped in this change so far (1a: 712, 1b:
  523, 1c: 569, 2a: 509, 7a: 476, 7b: 473, 8: 998/187-corrected). Not
  trimmed to fit: `records.ts`'s own doc comments carry the exact reasoning
  for six real, non-obvious design choices (the `toolName` vs `name`
  naming continuity, the skills-default gap, the modelName limitation, the
  duplicate-enum client-safety discipline) a reviewer needs to trust this
  file without re-deriving it, and the apply contract forbids shrinking a
  diff by deleting comments or compressing code. **Recommendation:
  `size:exception` for this slice**, consistent with every other unit
  shipped in this change so far — though at 5 lines over, a maintainer may
  reasonably decide this one is close enough to treat as in-budget.

### Status

2/2 tasks in unit 9 complete. Ready for `sdd-verify`. Report the
`size:exception` line-count risk (smallest overage so far, 5 lines) and,
more importantly, the Issues Found gap above (`run-tasks.ts`/`verify.ts` not
forwarding `records` into their persisted output, so worker and verifier
runs are not yet collectible) to the user/maintainer before merge — the
second one materially affects whether unit 10b's UI will have anything to
show for a typical build turn.

### Correction (parent-approved, second commit on this branch)

Scope widened by explicit user approval to include
`harness/tools/run-tasks.ts` and `harness/tools/verify.ts`, on top of the
same branch and the same native attempt. Fixes the Issues Found gap above
and four smaller follow-ups the parent's review caught.

1. **Worker and verifier records now actually persist.** `run-tasks.ts`'s
   `TaskOutcome` gained `record?: SubagentProgress`; `verify.ts`'s
   `RunVerifyResult` gained the same. Both are `undefined` only for an
   outcome that never dispatched a real sub-agent (`abortedBeforeStartOutcome`/
   `unmetDependencyOutcome` in `run-tasks.ts`; `refused`/`unavailable` in
   `verify.ts`). Neither `toModelOutput` (verify) nor `renderOutcomes`
   (run-tasks) reads `record` — confirmed by re-reading both: `renderOutcomes`
   destructures only `{ taskId, envelope }`, and `verify.ts`'s
   `toModelOutput` renders only `output.envelope` — so the orchestrator's
   model context is byte-for-byte unchanged.
2. **`run-tasks.ts` now passes real `skills` and a collision-safe
   `agentId` into `runSubagent`.** `runOneTask` computes
   `mergeSkills(ROLE_DEFAULT_SKILLS[task.role], task.skills)` ONCE and
   passes the same list to both `buildInstructions` (which no longer merges
   internally — its `extraSkills` param became a plain `skills` param) and
   `runSubagent`'s `skills` input, so the stamped record and the prompt the
   worker actually ran on can never drift apart. `agentId` is
   `` `${task.id}:${randomUUID().slice(0, 8)}` ``: traced `run-tasks.ts`'s
   own scheduler (`scheduleAndRun`/`runOneTask`) and confirmed it dispatches
   each task exactly once — no in-call retry — but nothing stops a LATER
   `run_tasks` call in the SAME turn (a corrective fix pass) from reusing an
   earlier batch's task id (`rejectDuplicateTaskIds` only checks uniqueness
   WITHIN one batch). The random 8-char suffix makes that reuse unable to
   collide on `agentId`, without needing `run-subagent.ts` or `records.ts`
   to know anything about tasks or retries.
3. **`RunSubagentResult`/`SubagentProgress`'s return no longer accumulates
   history.** `records: SubagentProgress[]` (every throttled snapshot,
   oldest first) became `record: SubagentRunRecord` (the final one only).
   `run-subagent.ts` no longer keeps a `records` array at all — each
   throttled tick now just `yield snapshot()` directly, live streaming for
   the UI, nothing retained in memory. Updated all four dispatch tools'
   generator type annotations implicitly (none touch `.records` by name
   except the two fixed in point 1) and `records.ts`'s `collectSubagentRuns`,
   which now looks for a `record` field (singular) at the top level and
   inside each `outcomes[]` entry, instead of `records` arrays — renamed
   `candidateRecordArrays` to `candidateRecords` accordingly.
4. **A new `"running"` value on `subagentRunStatusSchema`** replaces the
   first version's reuse of `"partial"` as the mid-run placeholder — a real
   bug the correction fixes, not just a naming nit: a role that legitimately
   exhausts its step budget (`statusFromFinishReason`'s own `"partial"`
   terminal case) was indistinguishable from a run that simply had not
   finished yet. `"running"` cannot collide with any genuine `EnvelopeStatus`
   value. `EnvelopeStatus` itself (`lib/ai/pricing.ts`) is unchanged — this
   is purely an addition to the record's own, wider `SubagentRunStatus`.
5. **`edits` is now deduplicated, first-seen order**: a path already
   recorded is never re-added or reordered on a second successful write to
   the same path (`!edits.includes(path)` before pushing). Chosen over
   move-to-end because a record's `edits` list reads as "which files this
   run touched," not "most recently touched first" — the UI's own per-call
   `toolCalls` list (unaffected by this change) is where call order and
   repeats are still fully visible.

Left as-is, per the correction's own scope: the `modelName`-always-primary
limitation (Deviation 4 above) — still dormant, still flagged.

#### Final persisted shapes (after this correction)

- `explore`, `plan`: `{ envelope: SubagentEnvelope, record: SubagentRunRecord }`
  (`RunSubagentResult`, persisted whole).
- `run_tasks`: `{ outcomes: { taskId: string, envelope: SubagentEnvelope,
  record?: SubagentRunRecord, wroteFiles: boolean }[] }`.
- `verify`: `{ outcome: "pass" | "fail" | "unavailable" | "refused",
  envelope: SubagentEnvelope, record?: SubagentRunRecord }`.

`collectSubagentRuns` reads `record`/`outcomes[].record` off any of these
structurally, without importing any of the four result types.

#### Verification (this correction)

- `cd apps/web && npx tsc --noEmit -p .` → clean, no output, exit 0 (direct
  `tsc`, not the turbo cache).
- `cd apps/web && pnpm lint` → 0 errors, the same 13 pre-existing warnings
  as before this correction — no delta.

#### Corrected line count

**Authored changed lines for the whole unit: 483** (402 insertions + 81
deletions across 4 files — `records.ts`, `run-subagent.ts`, `run-tasks.ts`,
`verify.ts` — per `git diff --stat b81a31b -- . ':!openspec'
':!apps/web/next.config.ts'`, i.e. the original commit plus this
correction, excluding `openspec/**` and the pre-existing unrelated
`next.config.ts` diff, which stayed untouched and unstaged throughout). This
is now **83 lines over the 400-line budget** — the second-smallest overage
in this change (after 7b's 473, ahead of 2a's 509) — grown from the
original 405 because fixing the Issues Found gap genuinely requires new,
non-trivial logic in two more files (the `agentId` collision analysis and
the `skills`/`buildInstructions` refactor in `run-tasks.ts`, the `record`
threading in `verify.ts`), not padding. **Recommendation: `size:exception`
for this slice, as corrected** — the user already approved this exact
widened scope, so the line-count risk is reported for visibility, not as an
open decision.

#### Residual risk

None from the correction itself — the gap it was written to close is
closed, and both new verification commands (foreground `tsc`, `pnpm lint`)
pass clean. The only carried-over risk is Deviation 4 (`modelName` always
reads the primary's display name), explicitly left as-is per the
correction's own scope, and already dormant since every `SlotCandidates`
list in the current registry holds exactly one entry.

### Status (updated)

2/2 tasks in unit 9 complete, correction applied and verified. Ready for
`sdd-verify`. Report the corrected `size:exception` line-count risk (483
lines, 83 over budget) to the user/maintainer before merge; the
`run-tasks.ts`/`verify.ts` persistence gap from the first version is now
resolved.

## Unit 10a — Sub-agent view components (PR 14)

Branch: `agent-harness/10a-subagent-view` (stacked on
`agent-harness/9-subagent-records`, at `807a562`).

- [x] 10a.1 Create `apps/web/components/chat/subagent-entry.tsx`
- [x] 10a.2 Create `apps/web/components/chat/subagent-sheet.tsx`
- [x] 10a.3 Create `apps/web/components/chat/subagent-run-detail.tsx`

3/3 tasks in unit 10a complete. Unit 10b remains (`[ ]`), unassigned to this
apply batch.

### Files Changed

| File | Action |
|---|---|
| `apps/web/components/chat/subagent-entry.tsx` | Created |
| `apps/web/components/chat/subagent-sheet.tsx` | Created |
| `apps/web/components/chat/subagent-run-detail.tsx` | Created |

### Props signatures

```ts
// subagent-entry.tsx
export function subagentStatusLabel(status: SubagentRunStatus): string
type SubagentEntryProps = { record: SubagentRunRecord; onSelect: (agentId: string) => void }
export function SubagentEntry(props: SubagentEntryProps): JSX.Element

// subagent-sheet.tsx
type SubagentSheetProps = {
  records: SubagentRunRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRunId: string | null
  onSelectRun: (agentId: string | null) => void
}
export function SubagentSheet(props: SubagentSheetProps): JSX.Element

// subagent-run-detail.tsx
type SubagentRunDetailProps = { record: SubagentRunRecord }
export function SubagentRunDetail(props: SubagentRunDetailProps): JSX.Element
```

All three take data in via props and report intent out via callbacks
(`onSelect`/`onOpenChange`/`onSelectRun`); none fetches data, imports
Trigger/chat wiring, or touches `chat-message.tsx`/`chat-thread.tsx`/
`game-chat.tsx`/`tool-parts.ts` — those are unit 10b's task.

### Design choices and how they map to design.md decision 16

- **Shimmer reuse, not a new treatment.** `SubagentEntry` and
  `SubagentRunDetail`'s status line both apply the existing `shimmer`
  utility class to `MarkerContent`/a `span`, the exact mechanism
  `apps/web/components/chat/tool-group.tsx:102` (`ToolGroup`'s
  `MarkerContent className={active ? "shimmer" : undefined}`) and
  `apps/web/components/chat/thinking.tsx:52` already use. The class itself
  (`packages/ui/src/styles/globals.css`'s compiled `.shimmer` utility,
  confirmed in the built CSS since the utility is not declared as literal
  source in this repo — it comes from the Tailwind v4 plugin chain) already
  disables its animation under `@media (prefers-reduced-motion: reduce)` at
  the CSS layer, so no reduced-motion branching was needed in either
  component.
- **`status === "running"` decides shimmer-vs-plain directly**, per the
  apply prompt's explicit instruction, rather than deriving it from a
  wrapping tool-part's own streaming state as design.md decision 16's prose
  first suggested and `records.ts`'s own `subagentRunStatusSchema` comment
  anticipated ("the running/finished distinction ... is still expected to
  come from the surrounding tool call's own streaming state ... unit 10b
  owns wiring that up"). Unit 9's later correction *replaced* the ambiguous
  ad hoc `"partial"`-as-placeholder with a real `"running"` enum value
  specifically so a consumer would not need that external signal — reading
  `record.status === "running"` here is a direct, simpler consequence of
  that correction, not a deviation from it. Documented at
  `subagentStatusLabel`'s own doc comment (`"running"` never reaches the
  label function).
- **`SubagentEntry`'s icon/tint states mirror `ToolMarker`'s three-state
  read (in flight / ok / failed)** rather than inventing a seven-way status
  icon set for `EnvelopeStatus`'s full range: `running` → `Spinner`,
  `error` → the same `Alert01Icon` + `text-destructive` tint `ToolMarker`
  uses for a failed tool call, everything else terminal → `Tick02Icon`
  with the plain human label from `subagentStatusLabel` (`"Stopped
  partway"`, `"Needs input"`, `"Cancelled"`, `"Skipped"`, `"Unavailable"`).
  This keeps the inline entry legible at a glance rather than asking the
  reader to learn seven icons; the full status text is still always
  present as the marker's own label.
- **`SubagentSheet` composes `Item`/`ItemGroup` (list) and delegates full
  detail to `SubagentRunDetail`** rather than inlining either. The header
  stays static ("Sub-agent runs" / "Every sub-agent this thread has
  dispatched.") in both modes; a "back" button (ghost `Button` +
  `ArrowLeft01Icon`, the same icon-object convention `tool-group.tsx`
  already uses for `Alert01Icon`/`Tick02Icon`) calls `onSelectRun(null)` to
  return to the list without closing the sheet. This is why `onSelectRun`'s
  type is `(agentId: string | null) => void` rather than `(agentId: string)
  => void`: the task text only asks for a `selectedRunId` prop, but a
  controlled panel that can show detail also needs a controlled way back to
  the list, and `null` reuses the same "nothing selected" value
  `selectedRunId` itself already carries.
- **`SubagentRunDetail` is self-contained**: it renders `displayName` and
  `role` as its own heading rather than relying on `SubagentSheet`'s title,
  so the component satisfies task 10a.3's full field list
  (`role, displayName, modelName, tier, slot, tool calls, edits, tokens,
  status`) on its own, independent of how 10b (or any other future caller)
  composes it into a page.
- **`Sheet`'s API is Base UI (`@base-ui/react/dialog`), not Radix**,
  confirmed by reading `packages/ui/src/components/sheet.tsx` before use:
  `open`/`onOpenChange` on the `Sheet` root match the prop names the task
  asked for directly, `SheetContent` defaults to `side="right"` (no prop
  needed), and `SheetTitle` is required for accessibility per the shadcn
  skill's Dialog/Sheet/Drawer rule — both `SubagentSheet`'s header states
  render one.

### Deviations from Design

None from `design.md` decision 16 or task 10a.1–10a.3's literal file/prop
list. The one clarification worth flagging (`status === "running"` deciding
shimmer directly, rather than deferring to a wrapping tool part) is
documented above as a consequence of unit 9's own later correction, not a
deviation from this unit's own scope — unit 9 had already resolved the
ambiguity `records.ts`'s comment flagged before this unit started.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused command | `cd apps/web && npx tsc --noEmit -p .` (fresh, not turbo-cached) → exit 0. `cd apps/web && pnpm lint` → 0 errors, the same 13 pre-existing warnings established since unit 7a/7b (`trigger/example.ts`, `game-menu.tsx`, 11 `turbo/no-undeclared-env-vars` entries). No new warning from any of the three new files. |
| Runtime harness | N/A per tasks.md's own row for this unit — the three components are not imported or rendered by anything yet (10b is the first caller). No manual dev scenario is possible until that wiring lands. |
| Rollback boundary | Revert the three new `apps/web/components/chat/subagent-{entry,sheet,run-detail}.tsx` files. Nothing outside this unit imports any of them yet, so the revert is fully self-contained; no other file was modified. |

### Workload / PR Boundary

- Mode: stacked-to-main chained PR slice (PR 14 of 15)
- Current work unit: 10a — Sub-agent view components
- Boundary: starts from `agent-harness/9-subagent-records`, ends with three
  typechecked, presentational, unrendered components ready for 10b's
  wiring; no other file changed
- **Authored changed lines: 357** (357 insertions, 0 deletions, across the 3
  new files — per `git diff --stat 807a562..HEAD -- . ':!openspec'`,
  excluding the pre-existing unrelated `apps/web/next.config.ts` diff, which
  was not staged this session). **Under the 400-line budget** — the first
  unit in this change to land under budget without needing a
  `size:exception`.

### Risks for 10b

1. **The `status === "running"` vs. tool-part streaming-state question is
   now settled**, per the Design Choices note above — 10b does not need to
   invent its own "is this run still going" signal; it can pass whatever
   `SubagentRunRecord.status` the persisted or live record carries straight
   through, and `SubagentEntry`/`SubagentRunDetail` already key off it
   correctly for every value, including a reloaded thread's terminal
   records (`subagent-view`'s Sub-Agent Records Survive Reload requirement).
2. **`onSelectRun` accepts `string | null`, not just `string`.** 10b.2's
   lifted state (`chat-thread.tsx`/`game-chat.tsx`) must type
   `selectedRunId` as `string | null` and pass a setter matching that
   signature, or the back button inside `SubagentSheet` will not compile
   against a narrower lifted type.
3. **`collectSubagentRuns` (unit 9, unchanged by this unit) is the expected
   source of `SubagentSheet`'s `records` prop** — 10b.3's `tool-parts.ts`
   reload wiring needs to call it across every dispatch-tool output found in
   a thread's persisted parts and feed the result to `SubagentSheet`/inline
   `SubagentEntry`s built from the live stream, so the same run shows
   identical detail before and after a reload, per that unit's own gap note
   above (now resolved: `run-tasks.ts`/`verify.ts` both forward `records`
   today).
4. **No `avatar` field exists yet** (`RoleDef.avatar` is reserved,
   design.md's role-catalogue footnote) — `SubagentEntry`'s `MarkerIcon` and
   `SubagentSheet`'s list rows use only the status icon (spinner/tick/alert),
   never a per-role avatar. If 10b or a later change adds `avatar` to
   `RoleDef`/`SubagentRunRecord`, both components have an obvious slot
   (`ItemMedia`/`MarkerIcon`) to extend into without a prop-shape break.

### Status

3/3 tasks in unit 10a complete. Ready for `sdd-verify`. This is the first
unit in the change to land inside the 400-line budget with no
`size:exception` needed. Unit 10b (wiring: header button, inline entry in
`chat-message.tsx`, lifted `{ open, selectedRunId }` state, reload parsing in
`tool-parts.ts`) is the final unit and a separate apply.
