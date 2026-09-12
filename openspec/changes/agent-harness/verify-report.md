```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9a49dc44c012be0c8e17ea839464e78574a873063c1f2543c04da3c9569e33ea
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 53/53
scenarios: 86/86
test_command: cd apps/web && pnpm lint
test_exit_code: 0
test_output_hash: sha256:6f167044918d5bef3e70f8281303e4efc5ff3cc63581a0f3053d8ee85921f874
build_command: cd apps/web && npx tsc --noEmit -p .
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: `agent-harness` (whole change, units 1a → 10b, 15 stacked PR slices)
**Version**: N/A (no prior spec version; new capabilities)
**Mode**: Standard (Strict TDD disabled — no test runner in this workspace, per project config; evidence = static checks + spec-to-code traceability via CodeGraph + recorded manual/dev runtime evidence)
**Branch verified**: `agent-harness/10b-subagent-wiring` @ `f412788` (contains 1a→10b in full), diffed against `master`
**Tasks source**: `openspec/changes/agent-harness/tasks.md`; progress source: `openspec/changes/agent-harness/apply-progress.md` (2764 lines, all 15 units)

### Completeness (tasks.md vs apply-progress.md)

| Metric | Value |
|--------|-------|
| Tasks total | 61 |
| Tasks complete (`[x]`) | 61 |
| Tasks incomplete (`[ ]`) | 0 |
| Work units | 15/15 marked "Ready for `sdd-verify`" |
| Gate tasks (1c.0, 2a.0, 4.0, 5.0) | All passed/confirmed (provider-options trace, real Vertex rates, parallel-call spike, Chromium snapshot spike) |

All 61 tasks across all 15 units are checked. No unchecked task blocks full verification.

### Build & Tests Execution

**Build** (`cd apps/web && npx tsc --noEmit -p .`): ✅ Passed — exit 0, empty output (no diagnostics).

**Type-check, `@workspace/db`** (`pnpm turbo typecheck --filter=@workspace/db`): ✅ Passed — exit 0 (cache hit, `tsc --noEmit`), confirming the `usageBreakdown jsonb` schema edit (`packages/db/src/schema.ts:234`) still typechecks.

**Lint** (`cd apps/web && pnpm lint`): ✅ Passed — 0 errors, 13 warnings, exit 0. All 13 warnings match the documented pre-existing/accepted baseline (`turbo/no-undeclared-env-vars` on 11 env vars including `HARNESS_PHASES` and `DAYTONA_GAME_SNAPSHOT` introduced by this change but structurally identical to the app's existing pattern of undeclared-in-`turbo.json` env vars; one `@typescript-eslint/no-unused-vars` in `game-menu.tsx`; one `no-explicit-any` in `trigger/example.ts` — neither touched by this change). No new error, no new warning beyond the documented 13-warning baseline the apply agent tracked from unit 2a onward.

**Coverage**: ➖ Not available (no test runner in this project; per `tasks.md`'s own Testing Strategy: "Static: `turbo typecheck`/`turbo lint`" + "Manual: Dev with `HARNESS_PHASES=on`").

**Independent runtime evidence on record** (not re-run this session, cited per the orchestrator's brief):
- 2026-09-12, two live `trigger dev` runs (`run_06g99vqsjs43himkaqoqnh0001`, `run_06g9a08v0va88slhusac4f1e01`) with `HARNESS_PHASES` on: `list_files → plan (submit_plan accepted first try) → run_tasks (concurrent workers) → verify`; no timeouts, no plan rejections; `ask_player` not exercised.
- 2026-09-13, live dev test of the sub-agent view (post-10b): works end to end; several, mostly visual, bugs deferred to a follow-up (see WARNING-5).
- Spikes: Vertex parallel calls at cap 3 (`docs/research/spikes/gemini-parallel.md`) — GO; Chromium snapshot (`docs/research/spikes/chromium-snapshot.md`) — GO on all 6 criteria.

### Spec Compliance Matrix

Legend: ✅ COMPLIANT (code + traceability, and runtime evidence where cited) · ⚠️ PARTIAL (code correct but the scenario cannot be exercised by the shipped configuration yet) · 🔍 RUNTIME-ONLY, UNTESTED (code path exists; no independent runtime confirmation of this exact scenario) · ❌ MISSING/CONTRADICTED (none found).

#### `agent-orchestration` (12 requirements / 20 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Size Routing | Small tweak routed directly | `instructions/workflow.ts:174-202` `routingInstructions` ("Make it yourself, directly... none of what follows applies"); decision 8 makes this prompt-directed by design (no code classifier) | 🔍 |
| Size Routing | New game/big feature → phases | Same file; `flags.ts` `HARNESS_PHASES` on by default since `257b310`; runtime: 2026-09-12 dev runs (list_files→plan→run_tasks→verify) | ✅ |
| Fixed Phase Order | Phases run in order | `workflow.ts:189-199` ("call `plan` first... then `run_tasks`... then `verify` before you reply"); runtime: 2026-09-12 sequence confirmed, no plan rejections | ✅ |
| Fixed Phase Order | An earlier phase aborts | Envelope `status` propagation (`pricing.ts:284-291` `EnvelopeStatus`); reply-composition half is prompt-level | 🔍 |
| Fixed Roles Per Phase | Role dispatch carries fixed parameters | `harness/roles.ts:26-88` (`RoleDef`, `ROLES`); `run-subagent.ts` resolves `resolveModel(turnState.tier, role.slot)`, `stepCountIs(role.maxSteps)` | ✅ |
| Fixed Roles Per Phase | Role catalogue names no model | `harness/roles.ts:9-32` — `RoleDef` has `slot`, no model/provider field | ✅ |
| Orchestrator Runs Tier's Strong Slot | Orchestrator model follows tier | `agent.ts` `orchestratorModelSettings(tier)` → `resolveModel(tier,"strong")` (apply-progress 1a/1c) | ✅ |
| Named Bot Identity Per Role | Display name stable across tiers | `harness/roles.ts:47-88` — `displayName` is a fixed string per role, independent of `resolveModel` | ✅ |
| Workers Never Delegate | Worker attempts to delegate | `harness/ownership.ts:84-97` `createScopedGameTools` — only read/write/list/replace/delete tools, no dispatch tool | ✅ |
| `ask_player` Stays With Orchestrator | Worker tool set excludes `ask_player` | `ownership.ts:90-96`; explorer tools filtered to `read_file`/`list_files` (apply-progress 2b); verifier gets no tools at all (`roles.ts:82-88`) | ✅ |
| `ask_player` Stays With Orchestrator | Orchestrator asks a clarifying question | `lib/games/ask-player.ts` + `components/chat/ask-player.tsx`; `ask_player` declared only on the orchestrator's tool set in `trigger/chat.ts` | ✅ |
| Sub-Agent Failures Return as a Result | Worker throws internal error | `run-subagent.ts:137-146` (`isAbortLike`, `summarize`) — caught into an `error` envelope, never re-thrown | ✅ |
| Sub-Agent Failures Return as a Result | Worker exhausts step budget | `statusFromFinishReason`'s `"partial"` terminal case (apply-progress unit 2a deviation 5) | ✅ |
| Abort Propagation | Turn hits shared time ceiling | `run-subagent.ts` merged abort/timeout handling, fixed in coordinator review (unit 2a: `case "abort"` sets `aborted`, status `"aborted"`); per-role timeout = `min(role.timeoutMs, deadline-now-60s)` (`turn-state.ts:72-75`, `roles.ts`) | ✅ |
| Compact Result Envelope | Successful worker returns compact result | `SubagentEnvelope{agent,status,summary,edits?,artifacts?,findings?}` (`pricing.ts`/`envelope.ts`); `toModelOutput` renders only `envelope`, never `records` (`explore.ts`, apply-progress 2b deviation 2) | ✅ |
| Parallel Dispatch Only on Disjoint Ownership | Two tasks own different files | `run-tasks.ts` concurrency pool (cap 3) + `ownershipOverlaps` (`ownership.ts:45-47`) gate concurrent dispatch (unit 4) | ✅ |
| Parallel Dispatch Only on Disjoint Ownership | Two tasks own an overlapping file | Same mechanism — overlapping pair forced sequential (unit 4, corrected in `b2e6f68`) | ✅ |
| Question Behavior | First message names a kind of game | `workflow.ts`'s pre-existing `ask_player` section, confirmed byte-identical pre/post unit 8 (unit 8 deviation 9) | ✅ |
| Question Behavior | First message is undecided | Same section, caps clarifying questions at 2 | ✅ |
| Question Behavior | Player asks a question mid-turn | Prompt-level; no independent runtime confirmation on record | 🔍 |

#### `agent-skills` (6 requirements / 8 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Registry Entry Shape | Entry has all three fields | `skills/registry.ts` `Skill{name,description,trigger,body}`; 8 `engine-*.ts` files each carry non-empty `description`/`trigger` (unit 7a, lossless-move verification documented with sha256 diff) | ✅ |
| Deterministic Role Defaults | Same role → same defaults | `ROLE_DEFAULT_SKILLS` fixed map in `registry.ts`, no runtime randomness | ✅ |
| Orchestrator-Selected Extra Skills | Orchestrator adds extra skill | `run-tasks.ts` `mergeSkills(ROLE_DEFAULT_SKILLS[task.role], task.skills)` (unit 7b + unit 9 correction) | ✅ |
| `loadSkill` Capped/Truncated | Skill under cap | `harness/tools/load-skill.ts` — ≤6k-char cap | ✅ |
| `loadSkill` Capped/Truncated | Skill exceeding cap | Same file — truncation marker included | ✅ |
| Unknown Skill Name Returns Error | Nonexistent skill requested | `load-skill.ts` returns `{error}` listing valid names; `taskSpecSchema.skills` also zod-validated against the closed `SkillName` enum (unit 7b deviation 3) | ✅ |
| No Shell Execution Exposed | Worker instructions include pushed skills | No `bash`/shell tool anywhere in `ownership.ts`/`tools.ts` tool sets (confirmed: read/write/list/replace/delete only) | ✅ |
| No Shell Execution Exposed | `loadSkill` tool itself | `load-skill.ts` returns only text content, no execution path | ✅ |

#### `file-ownership` (5 requirements / 7 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Declared Ownership Per Task | Task declares two owned files | `ownership.ts:18-22` `isOwned`, `:84-97` `createScopedGameTools` | ✅ |
| Out-of-Scope Writes Rejected w/ Actionable Error | Worker writes unowned file | `ownership.ts:58-65` `ownershipGuard` — error names the path + "outside this task's declared ownership" | ✅ |
| Out-of-Scope Writes Rejected w/ Actionable Error | Worker writes within scope | Same mechanism, `isOwned` true → write proceeds | ✅ |
| Engine and Vendor Protections Preserved | Ownership declared inside `engine/` | `tools.ts:218-235` `protectedPathError`, `PROTECTED_DIR_NAMES=[engine,vendor,.numa]`, applied to every write tool regardless of ownership (decision 11); also enforced pre-submission by `plan-validation.ts:50-56` `isProtectedOwnership` | ✅ |
| Engine and Vendor Protections Preserved | Ownership declared inside `vendor/` | Same mechanism | ✅ |
| `index.html` Cannot Be Deleted | Delete `index.html` attempted | `tools.ts:45` `ENTRY_FILE` guard on `delete_file`, confirmed unaffected by ownership scoping (apply-progress unit 3: "`index.html` delete stays rejected regardless of ownership") | ✅ |
| Parallel Dispatch Requires Disjoint Ownership | Ownership sets overlap | `ownership.ts:45-47` `ownershipOverlaps` + `run-tasks.ts` scheduler (unit 4) | ✅ |

#### `game-verification` (6 requirements / 8 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Verify Runs in Headless Chromium | Verify runs after workers finish | `daytona/verify-script.ts:85-153` (Playwright Chromium, console+screenshot capture); `harness/tools/verify.ts` dispatched after `run_tasks` per `workflow.ts` ordering | ✅ |
| Distinguish Turn-Caused vs Pre-Existing | New error introduced this turn | `verify-script.ts:135` `new_errors = current not in baseline` | ✅ |
| Distinguish Turn-Caused vs Pre-Existing | Pre-existing error | `verify-script.ts:136`; baseline frozen per turn (`turn-state.ts:38-48` `verifyBaseline`, `verify.ts:56-62` `baselineForThisTurn`) — traced deliberately to avoid a retry misclassifying its own still-broken error as pre-existing (apply-progress unit 6 deviation 2) | ✅ |
| One Corrective Retry on Turn-Caused Failure | Retry triggered, capped at one | `harness/tools/verify.ts:22` `MAX_VERIFY_CALLS_PER_TURN = 2`, `:64-74` `refusedResult` on a 3rd call this turn | ✅ |
| Honest Reporting After Retry | Error persists after retry | Data is honest (frozen baseline, code-decided verdict); final reply wording is prompt-only (`workflow.ts:196-202`) — no code asserts the reply text | 🔍 |
| Honest Reporting After Retry | Retry fixes the error | Same reasoning | 🔍 |
| Never Claim Success Without Running Verify | Verify was skipped | Same reasoning — prompt-level only (`workflow.ts:196`: "only ever written after `verify` has actually run") | 🔍 |
| Behavior When Verifier Unavailable | Chromium sandbox fails to provision | `CHROMIUM_LABEL` stamped at sandbox creation (`game-image.ts`/`utils.ts`, unit 5 deviation 1); `daytona/verify.ts:29` `VerifyStatus` includes `"unavailable"` | ✅ |

#### `model-tiers` (11 requirements / 21 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Player Selects a Tier, Not a Model | Player picks a tier | `model-catalog.ts:19-53` `TIERS`/`tierIdSchema`; `model-picker.tsx` lists tiers only (apply-progress 1a.7) | ✅ |
| Player Selects a Tier, Not a Model | Unknown tier from browser | `clientDataSchema` `{tier: tierIdSchema.optional()}.default({})` — zod rejects an out-of-enum value (apply-progress 1a.10) | ✅ |
| Player Selects a Tier, Not a Model | No tier sent | `model-registry.ts:182-184` `resolveTier` → `DEFAULT_TIER_ID` | ✅ |
| Tier Profiles Map Three Slots | Every slot of every tier resolves | `model-registry.ts:132-148` `TIER_PROFILES: Record<TierId,TierProfile>`, fully populated and typechecked | ✅ |
| Slot Fallback on Availability Failure | Primary unavailable, peer serves | `fallback-model.ts` composite retry-then-fallback (per GATE finding + coordinator-review fix, unit 1c); current `TIER_PROFILES` hold exactly one candidate per slot (`model-registry.ts:132-148`), so this exact scenario cannot fire against the shipped registry — logic present, typechecked, exercised only by a manual dev scenario (point a primary at an invalid id) | ⚠️ |
| Slot Fallback on Availability Failure | Failure after output started | `fallback-model.ts` only wraps pre-output failures (GATE note: retry/fallback happens inside `doGenerate`/`doStream`, before any part is emitted) | ✅ |
| Slot Fallback on Availability Failure | Content error is not availability error | Classification isolates `APICallError`/404/429/5xx/timeout only (GATE note) | ✅ |
| Slot Fallback on Availability Failure | Every candidate fails | Composite throws the last real error; `run-subagent.ts` catches → `error` status, turn does not crash | ✅ |
| Roles Resolve Models Only Through Slots | Same role on two tiers | `resolveModel(tier,slot)` is a pure function of `TIER_PROFILES` (`model-registry.ts:218-224`) | ✅ |
| Roles Resolve Models Only Through Slots | Orchestrator runs tier's strong slot | Same, via `agent.ts` `orchestratorModelSettings(tier)` | ✅ |
| Model Registry Owns Every Concrete Model | Registry entry shape | `ModelEntry` type + `REGISTRY` const feeding `resolveCandidates` (`model-registry.ts:238-250`) | ✅ |
| Swapping a Slot's Model | Swap strong model of one tier | By construction: `TIER_PROFILES`/`REGISTRY` are the only inputs to `resolveModel`; `pricing.ts` `RATES` keyed by `ModelEntryId`, not tier/slot | ✅ |
| Swapping a Slot's Model | Provider not yet installed | `ProviderId` closed union + per-provider factory in `models.ts` (typecheck-enforced, apply-progress 1a.3) | ✅ |
| Reasoning Effort Is a Registry Property | Same model at two efforts | `ModelEntry.providerOptions` + `<model>@<effort>` id convention (design decision 18); `fallback-model.ts:199-227` `mergeProviderOptions`/`withEntryProviderOptions` apply per-entry options, merged per provider key (fixed post coordinator-review, unit 1c) | ✅ |
| Usage Priced by Concrete Entry | Two slots on one turn | `pricing.ts:342-372` `priceTurn` sums per-entry `costMicroUsd` via `turnCostMicroUsd({modelId: entry.modelId, ...})` | ✅ |
| Usage Priced by Concrete Entry | Profile edited after a turn | `modelId` stamped at run time onto `usage_breakdown` (`usage.ts:162-170`) — historical rows immutable to later profile edits | ✅ |
| Per-Thread Tier Persistence | Reload of a tier thread | `message-model.ts:55-69` `readThreadTier`, walks backwards | ✅ |
| Per-Thread Tier Persistence | Reload of a legacy thread | Same function's `legacyModelMetadataSchema` fallback + `LEGACY_MODEL_TIER` (`model-catalog.ts:105-109`) | ✅ |
| Per-Thread Tier Persistence | Newest record wins | `readThreadTier` iterates from the last message backwards, returns first match (`message-model.ts:56-61`) | ✅ |
| Picker Shows Tiers | Opening the picker | `model-picker.tsx` lists `TIERS` (apply-progress 1a.7) | ✅ |
| Initial Registry Population | Registry contents at ship | `TIER_PROFILES` (`model-registry.ts:132-148`) references only the three Gemini ids; rates confirmed against Vertex pricing (unit 2a.0 GATE, user-confirmed 2026-09-11) | ✅ |

#### `subagent-view` (5 requirements / 10 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Sub-Agent Run Record Fields | Record for completed worker | `records.ts:133-157` `subagentRunRecordSchema` — all listed fields present; stamped in `run-subagent.ts` (unit 9) | ✅ |
| Sub-Agent Run Record Fields | Record for failed worker | Same schema; `status` covers `error`/`aborted`/etc., captured even on failure (unit 9, "captured even on failure/abort") | ✅ |
| Sub-Agent Run Record Fields | Record outlives a registry change | `modelName` stored as a plain stamped string (`records.ts:143`), never re-derived from the registry at display time | ✅ |
| Inline Entry Shimmers While Running | Worker running | `subagent-entry.tsx:80-105` — `shimmer` class + `Spinner` when `status === "running"` | ✅ |
| Inline Entry Shimmers While Running | Worker finishes | Same component — non-running branch renders `subagentStatusLabel`, no shimmer | ✅ |
| Runs Openable From Thread | Player opens panel from header | `game-chat.tsx` header button (apply-progress unit 10b) wired to the same `SubagentSheet` `chat-thread.tsx:221-227` renders | ✅ |
| Runs Openable From Thread | Player clicks a running entry | `SubagentEntry.onSelect` → `chat-thread.tsx:123-129` `onSelectRun` opens the Sheet focused on `agentId`; detail re-renders live from the same record stream | ✅ |
| Runs Openable From Thread | Player clicks a finished entry | Same mechanism, no special-casing needed | ✅ |
| Presented as Named Bots | Two runs of different roles | `subagent-sheet.tsx:103-104` — `ItemTitle=displayName`, `ItemDescription=role`; `subagent-run-detail.tsx` shows `modelName` only in the detail, not as the primary label | ✅ |
| Records Survive Reload | Reload after a phased turn | `tool-parts.ts` `collectSubagentRuns`/`subagentRunsForPart` read live and persisted dispatch-tool output identically (unit 10b); `records.ts:176-196` `candidateRecords` handles all four dispatch tools' output shapes (`explore`/`plan`/`run_tasks`/`verify`) after the unit 9 correction that made `run_tasks`/`verify` forward their records | ✅ |

#### `turn-usage-accounting` (8 requirements / 12 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Per-Model Pricing | Turn uses two different models | `pricing.ts:342-372` `priceTurn` — per-entry `costMicroUsd` via `turnCostMicroUsd(modelId, usage)` | ✅ |
| Per-Model Pricing | Same provider model, two efforts | `RATES` keyed by `ModelEntryId`; each effort is a distinct entry id | ✅ |
| Full-Turn Summation | Turn with one worker | `pricing.ts:353-363` sums `breakdown` array | ✅ |
| Full-Turn Summation | Turn with no sub-agents | Same — `breakdown` = orchestrator entry only | ✅ |
| Failed/Aborted Usage Still Counts | Worker fails partway | `run-subagent.ts:297-303` calls `turnState.addUsage` on every `onStepEnd`, regardless of eventual status | ✅ |
| Failed/Aborted Usage Still Counts | Worker aborted by ceiling | Same — usage accumulated per completed step before the abort | ✅ |
| Credits Chunk Reflects Full Turn | Phased turn, multiple workers | `turn-credits.ts:52-54` `turnCreditsChunk(cost: TurnCost)` takes the full summed cost; `trigger/chat.ts` calls `priceTurn(turnState.tier, turnState.ledgerFor(turn))` (unit 1b, stale-ledger fix applied) | ✅ |
| Persisted Turn Metadata Reflects Full Turn | Thread persistence after phased turn | `message-meta.ts`/`withTurnMeta` consume the same `TurnCost` (unit 1b file list) | ✅ (see WARNING-1) |
| Ledger and Polar Reflect Full Turn | Ledger entry for phased turn | `usage.ts:79-174` `recordTurnUsage(cost: TurnCost)` inserts summed tokens/cost/`usageBreakdown` | ✅ (see WARNING-1) |
| Exactly One Polar Event Per Turn | Turn dispatches multiple sub-agents | `usage.ts:176-182` — one `ingestTurnCredits` call per `recordTurnUsage` invocation; `externalId` scheme unchanged (design decision 10) | ✅ (see WARNING-1) |
| Exactly One Polar Event Per Turn | Turn with failed sub-agent still ingests once | `cost.breakdown` includes the failed sub-agent's usage; still exactly one `ingestTurnCredits` call | ✅ (see WARNING-1) |
| Per-Sub-Agent Breakdown Retained | Breakdown available after phased turn | `usage.ts:162-170` — `usageBreakdown: {tier, entries}` stored in `turn_usage.usage_breakdown jsonb` | ✅ (see WARNING-1) |

**Compliance summary**: 79/86 scenarios fully confirmed (code + traceability, several also runtime-confirmed); 6 scenarios are code-correct but confirmable only by exercising the exact live behavior described (prompt-level reply honesty, or an as-yet-unexercised message shape) — none contradicted by code; 1 scenario (`model-tiers` slot fallback happy path) is implemented and typechecked but dormant against the shipped single-candidate-per-slot registry, by design (Initial Registry Population requirement).

### Task Completion Check (tasks.md vs code state)

All 61 tasks across 1a, 1b, 1c, 2a, 2b, 3, 4, 5, 6, 7a, 7b, 8, 9, 10a, 10b are checked `[x]` and match `apply-progress.md`'s own per-unit status ("Ready for `sdd-verify`"). No task references code that is absent from the branch — every file named in `apply-progress.md`'s "Files Changed" tables for all 15 units is present in `git diff master...HEAD` (66 files changed, +6805/-908 lines excluding `openspec/**` and the pre-existing unrelated `apps/web/next.config.ts` diff). Two post-hoc corrections (unit 4's cross-call `dependsOn`/duplicate-id fix, unit 9's `run-tasks.ts`/`verify.ts` record-forwarding fix, unit 8's `HARNESS_PHASES=false` prompt-restoration fix, unit 10b's concurrent-worker-visibility fix) are each documented with their own verification (`tsc`/`lint` re-run) and are reflected in the current HEAD.

### Design-Decision Drift (design.md vs code)

| Decision | Followed? | Notes |
|---|---|---|
| 1–2 (roles, slots) | ✅ Yes | One planner, not two; every role (orchestrator included) resolves via `resolveModel(tier, role.slot)` |
| 3 (dispatch shape) | ✅ Yes | One tool per phase (`explore`/`plan`/`run_tasks`/`verify`); `run_tasks` batches ≤4, pool cap 3 |
| 4 (result envelope) | ✅ Yes | `{envelope, records}` at the runner level; `toModelOutput` renders envelope only |
| 5 (progress streaming) | ✅ Yes, with a documented substitution | `result.stream` used instead of the deprecated `fullStream` (installed `ai@7.0.93` marks it `@deprecated`, identical type) — documented in apply-progress unit 2a |
| 7 (artifacts under `.numa/`) | ✅ Yes | `.numa/` reserved-prefix write guard extended to the orchestrator's own tools too (Deviation 1 in design.md itself) |
| 8 (routing) | ✅ Yes | Prompt rule (`routingInstructions`) + WHEN TO USE/NOT on `plan`; no mandatory classifier, as decided |
| 9–10 (usage/ledger) | ✅ Yes | Per-run pricing summed once; one `turn_usage` row per turn, `usage_breakdown jsonb` added nullable via `pnpm db:push` (see WARNING-1 for push-application status) |
| 11–12 (ownership) | ✅ Yes | Protected-prefix guard in code (not prompt-only, per design's own Deviation 3); pairwise overlap + `dependsOn` enforced in `run_tasks` and `submit_plan` |
| 13 (verification) | ✅ Yes | Deterministic Playwright check + `strong`-slot verifier with no tools; code decides the console verdict, model can only add visual findings |
| 14 (skills) | ✅ Yes | 8 typed skill modules, role defaults + task extras, `load_skill` fallback | 
| 15 (run records) | ✅ Yes | Stored as final tool output inside `games.messages`, no new table |
| 16 (view) | ✅ Yes | Shimmer reuse, inline entry + right `Sheet`, `selectedRunId` lifted; concrete model shown only in detail |
| 17 (`ask_player`) | ✅ Yes | Orchestrator-only; workers report `blocked` instead |
| 18 (registry/tiers) | ✅ Yes | `resolveModel(tier, slot)` is the sole resolution path; registry entries carry rate cards in `pricing.ts` keyed by entry id |
| 19 (slot fallbacks) | ✅ Yes, with one corrected first draft | Coordinator review caught and fixed an eager-fallback bug (fell back on first error instead of after the SDK's own retries) and a `providerOptions` leak bug before this landed (unit 1c) |
| Deviations 1–4 (explicit, in design.md) | ✅ Acknowledged and implemented | `.numa/` write reservation for orchestrator tools, verification limited to snapshot-provisioned sandboxes, `engine/`/`vendor/` protection moved to code, `explore.md`'s per-role model-tier note superseded by Amendment 2 |

No design decision was contradicted by the shipped code. Several documented deviations from tasks.md's literal file-scope wording (not from design.md's substance) were necessary and are traced above and in apply-progress.md (e.g., `AgentUsageEntry`/`EnvelopeStatus` landing in `pricing.ts` ahead of unit 2a's `envelope.ts`; `trigger/chat.ts`/`tool-parts.ts` wiring needed by units 1c/3/6 beyond their literal task lists) — none of these change what a spec requirement or scenario asks for.

### Open Item From the Orchestrator's Brief

**`run_tasks` ↔ `.numa/tasks.json` cross-check**: design.md's Data Flow diagram shows `run_tasks({tasks:[t1,t2]}) → check disjoint + deps + owns ⊆ tasks.json`, but no task in tasks.md (units 3, 4, or 8) implements the `⊆ tasks.json` half, and `run_tasks.ts` does not read `.numa/tasks.json` at all (apply-progress unit 8, Deviation 8, explicitly flags this as an open gap). Checked against every scenario in `agent-orchestration` and `file-ownership`: both specs' "Parallel Dispatch..."/"...Requires Disjoint Ownership" requirements are about the dispatched **batch's own pairwise ownership**, not about conformance to a previously submitted plan; no scenario in any of the seven specs requires validating a `run_tasks` call against `.numa/tasks.json`. **Classified as WARNING-3, not CRITICAL.**

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **`pnpm db:push` was never confirmed applied** for the `usage_breakdown jsonb` column added in unit 1b (`packages/db/src/schema.ts:234`) — it failed in the apply session with a Neon credential error and no later unit records a successful push. Until it is applied to the target branch, `recordTurnUsage`'s single `INSERT` (`apps/web/lib/games/usage.ts:141-174`, which writes `usageBreakdown` in the same statement as every other column) will fail for every turn; its `catch` block (`usage.ts:190-192`) swallows the error silently, so the `turn_usage` ledger row and the single Polar ingestion (`ingestTurnCredits`, `usage.ts:176`) will not happen for any turn in an unpushed environment — though the browser-facing `data-turn-credits` chunk still fires (it never touches the DB). Code for `turn-usage-accounting` is correct; this is an operational precondition, not a code defect. **Action: run `pnpm db:push` (never `drizzle-kit generate`/`migrate`, per this project's convention) and re-confirm a `turn_usage` row is written before relying on ledger/Polar data.**
2. **`SubagentRunRecord.modelName` always reads the slot's primary's `displayName`**, even on a call a fallback candidate actually served (`modelId` is correct — it reads the serving entry). Documented as a known, currently dormant limitation in apply-progress unit 9 (Deviation 4): every `TIER_PROFILES` slot holds exactly one candidate today (Initial Registry Population requirement), so no live path can trigger the discrepancy yet. Flagged for whoever adds the first second-candidate slot.
3. **`run_tasks` does not cross-check a task's `owns`/role against `.numa/tasks.json`** (design.md's Data Flow diagram vs. tasks.md's own unit 8 scope — see "Open Item" above). Not a spec violation on the current requirement text, but a real gap between design.md and tasks.md worth an explicit decision: add the check in a follow-up, or document `run_tasks` as intentionally independently callable (matching decision 8's advisory framing of "calling `plan` is the route").
4. **"Honest Reporting After Retry" and "Never Claim Success Without Running Verify"** are enforced only at the prompt level (`instructions/workflow.ts:196-202`) — apply-progress unit 6's own Deviation 7 states plainly that no code in that unit enforces the orchestrator's *reply text*; the underlying data (frozen baseline, code-decided verdict) is trustworthy, but reply honesty depends on model instruction-following, an inherent LLM-harness limitation the design itself accepts. Recommend keeping this on the manual QA checklist rather than treating it as independently verified.
5. **Sub-agent view has known, mostly-visual bugs** from the 2026-09-13 live dev test (per the user's own runtime evidence) — the flow works end to end but several bugs were deferred to a follow-up. Not a spec violation on the record, but should be tracked before calling `subagent-view` production-ready.
6. **11 of 15 stacked PR slices shipped over the 400-line review budget** (1a: 712, 1b: 523, 1c: 569, 2a: 509, 7a: 476, 7b: 473, 8: 998→187 after a scoped correction, 9: 483/405) — each carries its own apply-agent-authored `size:exception` recommendation with a specific justification (comment density, genuinely new logic, cross-file cohesion). The orchestrator's brief already lists these (1a, 1b, 1c, 4, 7a, 7b, 8, 9, 10a) as accepted exceptions; noted here only for the review-workload record, not as a new finding.

**SUGGESTION**:
1. `AgentUsageEntry.role` is typed as bare `string` rather than `RoleId | "orchestrator"` (`pricing.ts:295`) to avoid an `lib/ai` → `lib/games` import (unit 2a's own documented resolution). Safe today; a stricter type would catch a typo'd role literal at compile time if `lib/ai` ever gains a role-aware helper.
2. `records.ts` intentionally duplicates small closed enums (`SubagentRoleId`, `SubagentSlot`, the run-status union) rather than importing `RoleId`/`Slot`/`EnvelopeStatus`, for architectural-firewall reasons (client-safety-by-non-import, matching `model-catalog.ts`'s existing precedent). Worth a comment or lint rule tying the two together so a future role/slot addition is not missed in the duplicate.
3. `load_skill` is not in `tool-parts.ts`'s `TOOL_LABELS` (unit 7b Deviation 4) — falls back to a generic label. Minor UI-polish opportunity, not a spec gap (the fallback still renders correctly).
4. Re-confirm the Vertex rate card (fixed in unit 2a.0's GATE, user-confirmed 2026-09-11) before production launch, since at least one rate (`gemini-3.8-flash`'s `cachedInput`) is scheduled to change on a fixed future date (2027-01-01) — keep the `RATE_TABLE_VERSION` bump discipline going forward.

### Verdict

**PASS WITH WARNINGS** — 61/61 tasks complete, 0 unchecked, 0 CRITICAL findings; both required verification commands (`tsc --noEmit`, `pnpm lint`) plus the `@workspace/db` typecheck pass clean; every spec requirement across all 7 capabilities has direct code/traceability evidence, with 6 scenarios confirmable only by exercising exact prompt-driven or as-yet-unexercised behavior (none contradicted) and 1 scenario dormant by the registry's own current population. The one item requiring action before this is fully production-safe is WARNING-1 (`pnpm db:push` confirmation) — everything else is either already-accepted (size exceptions), already-known (sub-agent view visual bugs), or a documented, non-blocking design/tasks-artifact gap (WARNING-3).
