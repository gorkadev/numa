import { chat } from "@trigger.dev/sdk/ai"

import { DEFAULT_TIER_ID, type TierId } from "@/lib/ai/model-catalog"
import type { ModelEntryId, ServedCall, Slot } from "@/lib/ai/model-registry"
import type { AgentUsageEntry } from "@/lib/ai/pricing"

/**
 * The per-turn state every dispatch tool and hook reads and writes.
 *
 * `chat.local`, so it survives across turns within one run (a turn suspended
 * on `ask_player` resumes into the same process) and is cleared between runs
 * — see the `chat.local` warning about initializing in `onBoot`, never
 * `onChatStart`: this module is declared once, at import time, and `init()`
 * has to be called from `onBoot` in `trigger/chat.ts` or every access before
 * the first turn throws.
 *
 * `ledger` (read through `ledgerFor`, never bare) is the accumulator
 * `lib/ai/pricing.ts`'s `priceTurn` sums: the orchestrator's own run today,
 * every dispatched sub-agent from unit 2a onward. `tier` is the turn's
 * resolved tier (never `undefined` — `onTurnStart` always calls `reset` with
 * the output of `resolveTier`), so every later caller that needs "this
 * turn's tier" — the ledger, `run-subagent.ts`'s
 * `resolveModel(turnState.tier, role.slot)` in unit 2a — reads the same
 * single value rather than each re-deriving it from `clientData`.
 *
 * `unavailable` and `served` back `resolveModel`'s `FallbackHooks` (decision
 * 19, unit 1c): `lib/ai` cannot import this module (the ban runs the other
 * way — see `AgentUsageEntry`'s comment in `pricing.ts`), so `resolveModel`'s
 * caller builds hooks that read/write these two fields instead, and the
 * composite it returns never has to know `turnState` exists.
 *
 * `finishedTaskIds` backs `run_tasks`' cross-call `dependsOn` check (design.md
 * decision 12, unit 4): "has not finished this turn" means any earlier
 * `run_tasks` call in this same turn, not only the current batch, so a task
 * id from a call that already returned must still satisfy a later batch's
 * dependency on it.
 */
type TurnStateData = {
  turn: number
  deadline: number
  tier: TierId
  ledger: AgentUsageEntry[]
  verifyCalls: number
  /** Registry entries a slot fallback already ruled out this turn. */
  unavailable: Set<ModelEntryId>
  /** The entry that actually served the latest call on each slot. */
  served: Partial<Record<Slot, ServedCall>>
  /** Ids of every `run_tasks` task that has run to completion this turn, across every call. */
  finishedTaskIds: Set<string>
}

const local = chat.local<TurnStateData>({ id: "turnState" })

export const turnState = {
  get turn(): number {
    return local.turn
  },
  /** Epoch milliseconds; `run-subagent.ts` (unit 2a) times a role out at
   * `min(role.timeoutMs, deadline - now - 60s)`. */
  get deadline(): number {
    return local.deadline
  },
  get tier(): TierId {
    return local.tier
  },
  /**
   * The ledger, but only if it actually belongs to `turn` — never a bare
   * getter. `onValidateMessages` and `hydrateMessages` run BEFORE
   * `onTurnStart`, inside the same try the SDK wraps the whole turn in; if
   * either throws (the credit gate in `onValidateMessages`, for one),
   * `onTurnStart` never runs and `onTurnComplete` still fires — with `usage`
   * `undefined`, but with `turnState` still holding whatever the PREVIOUS
   * turn left in it, because nothing reset it. Pricing that stale ledger
   * would re-bill the previous turn a second time. Comparing `local.turn` to
   * the caller's own `turn` is what catches that: they only match when
   * `onTurnStart` actually ran for this turn.
   *
   * `init()`'s placeholder `turn: 0` cannot cause the same collision: if a
   * chat's real turn 0 fails before `onTurnStart`, the ledger is still `[]`
   * from `init()`, so `ledgerFor(0)` returning it is harmless — there is
   * nothing in it to re-bill.
   */
  ledgerFor(turn: number): AgentUsageEntry[] {
    return local.turn === turn ? local.ledger : []
  },
  get verifyCalls(): number {
    return local.verifyCalls
  },
  set verifyCalls(value: number) {
    local.verifyCalls = value
  },

  /** Whether a slot fallback already ruled this entry out this turn. */
  isUnavailable(id: ModelEntryId): boolean {
    return local.unavailable.has(id)
  },

  /**
   * Records an availability failure so later calls on the same slot, this
   * turn, skip straight past it (decision 19). A new `Set` rather than a
   * mutating `.add`, for the same shallow-proxy reason as `addUsage` below.
   */
  markUnavailable(id: ModelEntryId): void {
    local.unavailable = new Set(local.unavailable).add(id)
  },

  /** What actually served the latest call on `slot`, if any call succeeded. */
  servedFor(slot: Slot): ServedCall | undefined {
    return local.served[slot]
  },

  /** Called by a slot's `FallbackHooks.onServed` on every successful call. */
  recordServed(slot: Slot, served: ServedCall): void {
    local.served = { ...local.served, [slot]: served }
  },

  /** Whether a `run_tasks` task with this id has finished, in this or an earlier call this turn. */
  isTaskFinished(taskId: string): boolean {
    return local.finishedTaskIds.has(taskId)
  },

  /**
   * Records that a `run_tasks` task finished, so a later call this same turn
   * can satisfy a `dependsOn` naming it. A new `Set` rather than a mutating
   * `.add`, for the same shallow-proxy reason as `markUnavailable` above.
   */
  markTaskFinished(taskId: string): void {
    local.finishedTaskIds = new Set(local.finishedTaskIds).add(taskId)
  },

  /**
   * Called once from `onBoot`, which — unlike `onChatStart` — fires on every
   * fresh worker, continuation runs included. The values here are
   * placeholders for the window before the first turn's `onTurnStart`;
   * `reset` below is what every real turn actually runs on.
   */
  init(): void {
    local.init({
      turn: 0,
      deadline: 0,
      tier: DEFAULT_TIER_ID,
      ledger: [],
      verifyCalls: 0,
      unavailable: new Set(),
      served: {},
      finishedTaskIds: new Set(),
    })
  },

  /**
   * Called once from `onTurnStart`, so a turn never inherits the previous
   * turn's ledger, verify count, tier, deadline, unavailable candidates,
   * served entries or finished task ids.
   */
  reset(turn: number, deadline: number, tier: TierId): void {
    local.turn = turn
    local.deadline = deadline
    local.tier = tier
    local.ledger = []
    local.verifyCalls = 0
    local.unavailable = new Set()
    local.served = {}
    local.finishedTaskIds = new Set()
  },

  /**
   * Appends one priced call. Replaces the whole array rather than mutating it
   * in place: `chat.local` proxies shallowly, so pushing onto the existing
   * array would leave the local's dirty tracking unaware anything changed.
   */
  addUsage(entry: AgentUsageEntry): void {
    local.ledger = [...local.ledger, entry]
  },
}
