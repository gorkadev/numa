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
