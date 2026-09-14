# Proposal: Multi-agent game-building harness

## Intent

One `streamText` loop builds a whole game in a single context with a single model. It skips planning and parallel work, and nothing checks that the game runs. We will add an orchestrator that routes work by size and delegates to in-process specialist sub-agents. Credits must still cover the whole turn.

The player today picks a raw Gemini model, and the design would have hardcoded Google model ids into every role. Instead, the player picks a **tier** (a power/budget choice), each role runs on a **slot** of that tier, and a numa-owned **model registry** is the only place that knows providers, model names, reasoning effort and rates. The player pays for the tokens; numa is responsible for orchestrating them well.

## Scope

### In Scope
- Size routing: the orchestrator edits small tweaks directly. A new game or big feature goes through understand, design, tasks, workers, verify and reply.
- `ToolLoopAgent` roles, each with its own tools, model slot and step budget. Workers never delegate, and `ask_player` stays with the orchestrator.
- Model tiers: tiers (`pro`, `balanced`, `fast`; labels are a UI decision, ids are stable), tier profiles mapping slots (`strong`, `mid`, `light`) to registry entries, and a model registry (stable id, provider, provider model id, optional provider options such as reasoning effort, display name, rate card). The picker shows tiers; the thread persists the tier; legacy threads that stored a Gemini model id map to a tier deterministically. The orchestrator runs the tier's `strong` slot.
- Slot fallbacks: each slot holds an ordered list of peer candidates (same tier and slot, similar capability). A call that fails before any output with an availability error moves to the next candidate; billing follows the entry that served it.
- Initial registry population: only the three existing Gemini models on the installed Vertex provider, arranged into the three tier profiles.
- Sub-agent usage in the credits chunk, `withTurnMeta`, the ledger and Polar, plus a per-sub-agent breakdown priced by the concrete registry entry that ran.
- Enforced file ownership. Only tasks with disjoint ownership run in parallel.
- Headless Chromium verification (console errors and a screenshot) on a custom Daytona snapshot.
- A skills registry, role-default skills pushed into each role's instructions, and a capped `loadSkill`.
- A sub-agent view: a thread-header button and a right `Sheet`; an inline shimmer entry per running sub-agent that opens the Sheet focused on that run when clicked (running or finished); sub-agents presented as named bots (a stable placeholder `displayName` per role); each run's concrete model, tool calls, edits and tokens in its detail.

### Out of Scope
- `AgentChat`/durable sub-agents; per-game custom skills; Trigger.dev native skills and their `bash` tool.
- Metering sandbox compute; prompt caching.
- Adding Anthropic, OpenAI or any other provider or model to the registry. Each needs its provider package installed and verified rates; the registry is built so that this is a registry-only change later.
- Final bot names and avatars (the role catalogue reserves an `avatar` field, not designed now); final tier labels and copy.

## Capabilities

### New Capabilities
- `agent-orchestration`: routing, phases, roles bound to slots, delegation contract, parallel dispatch, named bot identity per role
- `model-tiers`: tiers, tier profiles, slot resolution, the model registry, legacy thread mapping and the tier picker
- `turn-usage-accounting`: pricing each run's usage at its concrete registry entry's rate, per-sub-agent breakdown
- `file-ownership`: scoped write tools that reject paths outside the task's owned files
- `game-verification`: Chromium snapshot and the verify role
- `agent-skills`: the registry, pushed role defaults and `loadSkill`
- `subagent-view`: sub-agent run records, the inline shimmer entry, and the Sheet that opens them

### Modified Capabilities
None (`openspec/specs/` is empty).

## Approach

Each sub-agent is exposed to the orchestrator as a tool. The tool runs a `ToolLoopAgent`, forwards the stop signal and returns a compact result. Every role, the orchestrator included, resolves its model as `resolveModel(turnTier, role.slot)`, so a role never names a model. A per-turn accumulator collects `totalUsage` by concrete registry entry. Parallel work fans out with `Promise.all` inside a single dispatch tool, so correctness does not depend on the model emitting parallel calls.

## Affected Areas

| Area | Impact |
|------|--------|
| `apps/web/lib/ai/model-catalog.ts` | Modified: client-safe tier catalogue replaces the model list; legacy id → tier mapping |
| `apps/web/lib/ai/model-registry.ts` | New: server-only registry entries and tier profiles, `resolveModel` |
| `apps/web/lib/ai/models.ts`, `apps/web/lib/ai/agent.ts` | Modified: provider instances built from registry entries; tier resolution replaces model resolution |
| `apps/web/lib/ai/message-model.ts` | Modified: the thread persists the tier, reads legacy model ids |
| `apps/web/components/model-picker.tsx` and its callers | Modified: lists tiers |
| `apps/web/trigger/chat.ts` | Modified: `clientDataSchema` carries the tier; dispatch, accumulator, hooks |
| `apps/web/lib/games/tools.ts` | Modified: ownership-scoped variant |
| `apps/web/lib/ai/pricing.ts`, `apps/web/lib/ai/message-meta.ts`, `apps/web/lib/games/usage.ts`, `apps/web/lib/games/turn-credits.ts` | Modified: rates keyed by registry entry id; multi-model totals |
| `apps/web/lib/games/instructions/` | Modified: skills registry |
| `apps/web/lib/daytona/utils.ts` | Modified: snapshot and verify |
| `apps/web/components/chat/`, `apps/web/lib/games/tool-parts.ts` | New: sub-agent view |
| `packages/db/src/schema.ts` | Possible: ledger breakdown (`pnpm db:push`) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Misbilling: the ledger and pricing assume one `modelId` per turn | High | Price each run at its concrete entry's rate, then sum micro-USD; keep the Polar `externalId` as is |
| A tier profile points a slot at an entry with no rate card | Low | Rates are a `Record` keyed by the registry entry id, so a missing rate fails typecheck |
| With only three Gemini models, tiers collapse slots (e.g. `fast` is one model) | High | Accepted for this change; the abstraction is what ships, richer profiles follow with new providers |
| Gemini on Vertex fails on parallel calls | Med | Early spike; fan-out stays in code |
| Chromium image is too slow or too costly | Med | A spike gates the verify work unit |
| The whole turn shares the 3600 s ceiling | Med | Step budgets and per-phase aborts |
| A crash loses in-flight sub-agent work | Low | Accepted |

## Rollback Plan

Each work unit ships as its own PR and can be reverted on its own. The single-loop path stays the default until routing ships. Any schema change only adds columns. Reverting the tier unit restores the raw model picker; a tier record then does not parse as a model, so a thread falls back to its last legacy model record or the default model.

## Success Criteria

- [ ] A first message that names a kind of game builds without questions; only an undecided one ("make me a game") asks, at most twice.
- [ ] Turn credits equal the sum of the orchestrator's and every sub-agent's cost, each priced at the rate of the concrete registry entry it ran on.
- [ ] Swapping the model behind a slot (including a change of provider) requires editing only the model registry and the tier profiles — no role, prompt, pricing formula or UI change.
- [ ] The picker shows tiers, never model or provider names; a reloaded thread restores its tier, and a legacy thread that stored a Gemini model id restores the mapped tier.
- [ ] A game with a JS error is caught by verify before the reply.
- [ ] When a slot's primary model is unavailable before producing output, a peer candidate of the same tier and slot serves the call, and the turn's breakdown bills the serving model.
- [ ] A worker's write outside its owned files is rejected.
- [ ] Every sub-agent appears inline under its bot name (shimmering while it runs) and, when clicked, opens the Sheet on that run showing its concrete model.
- [ ] `turbo typecheck` and `turbo lint` pass.

## Suggested Delivery Slicing (each ≤400 lines)

1a. Model tiers: registry, tier profiles, `resolveModel`, rates keyed by entry id, tier picker, tier persisted per thread with legacy mapping. The orchestrator runs `strong`.
1b. Usage accumulator across models (priced by concrete entry), with no change in behavior.
1c. Slot fallbacks: composite model over ordered peer candidates, pre-output availability fallback, usage attributed to the serving entry.
2. Read-only explorer sub-agent, proving usage summation end to end.
3. File-ownership tools and one sequential worker.
4. Gemini parallel spike, then parallel dispatch.
5. Chromium snapshot spike and image definition.
6. Verify role.
7. Skills registry, pushed defaults and `loadSkill`.
8. Size routing and phase flow.
9. Sub-agent run records.
10. Sub-agent view UI (header button, Sheet, inline shimmer entry, named bots).
