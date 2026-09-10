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
