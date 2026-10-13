import type { LanguageModel, streamText } from "ai"

import {
  createFallbackModel,
  type ConcreteLanguageModel,
  type FallbackHooks,
} from "./fallback-model"
import {
  DEFAULT_TIER_ID,
  isTierId,
  type TierId,
} from "./model-catalog"
import { providerModel } from "./models"

export type { FallbackHooks, ServedCall } from "./fallback-model"

/**
 * Server-only: the model registry.
 *
 * This is the ONLY place that knows a provider, a provider model id, per-call
 * provider options or a display name for a concrete model — see decision 18 in
 * `design.md`. Every role, the orchestrator included, reaches a model by
 * calling `resolveModel(tier, slot)`; nothing else in the codebase is allowed
 * to name a provider or a provider model id. Swapping the model behind any
 * slot of any tier, including a change of provider, means editing only
 * `REGISTRY` and `TIER_PROFILES` below.
 *
 * Nothing here may be imported from a client component, for the same reason
 * `./models` cannot be: it pulls in provider instances. The client-safe half
 * of the tier story — the ids and copy a picker needs — is `./model-catalog`.
 */

export type Slot = "strong" | "mid" | "light"

/**
 * Only `google-vertex` is installed. Adding a provider means adding it here,
 * to `./models`' factory table, and to at least one registry entry — an entry
 * naming a provider that is not in the factory table fails typecheck.
 */
export type ProviderId = "google-vertex"

/** Opaque execution IDs distinguish provider-model + effort; history is unchanged. */
export type ModelEntryId =
  | "argon-medium"
  | "argon-high"
  | "argon-low"
  | "flash-high"
  | "flash-medium"
  | "lite-medium"
  | "lite-minimal"

/**
 * `ai`'s `ProviderOptions` type is not re-exported from the `ai` package
 * itself — it lives in `@ai-sdk/provider-utils`, which this app does not
 * depend on directly — so it is derived from `streamText`'s own parameter
 * type instead of adding an undeclared dependency for one type.
 */
type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>

export type ModelEntry = {
  id: ModelEntryId
  provider: ProviderId
  providerModelId: string
  /**
   * Per-call provider options, such as Gemini's `thinkingConfig.thinkingLevel`
   * reasoning effort. Travels with the entry to every call made on it — see
   * decision 18. The same underlying provider model at a different effort is a
   * different entry with its own id and its own rate card, never a variant of
   * this one.
   */
  providerOptions?: ProviderOptions
  displayName: string
}

function entry(
  id: ModelEntryId,
  providerModelId: string,
  name: string,
  effort: "minimal" | "low" | "medium" | "high"
): ModelEntry {
  return {
    id,
    provider: "google-vertex",
    providerModelId,
    displayName: `${name} (${effort})`,
    providerOptions: { googleVertex: { thinkingConfig: { thinkingLevel: effort } } },
  }
}

const REGISTRY: Record<ModelEntryId, ModelEntry> = {
  "argon-medium": entry("argon-medium", "gemini-4-argon", "Gemini 4 Argon", "medium"),
  "argon-high": entry("argon-high", "gemini-4-argon", "Gemini 4 Argon", "high"),
  "argon-low": entry("argon-low", "gemini-4-argon", "Gemini 4 Argon", "low"),
  "flash-high": entry("flash-high", "gemini-3.8-flash", "Gemini 3.8 Flash", "high"),
  "flash-medium": entry("flash-medium", "gemini-3.8-flash", "Gemini 3.8 Flash", "medium"),
  "lite-medium": entry("lite-medium", "gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "medium"),
  "lite-minimal": entry("lite-minimal", "gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "minimal"),
}

/**
 * A slot's candidates, primary first. In this change every list holds exactly
 * one entry, but `resolveModel`
 * already tries the whole list in order through `createFallbackModel`
 * (decision 19, unit 1c): adding a peer only changes the list here, nothing
 * in `resolveModel` or its callers.
 *
 * Authoring rule for whoever adds a second candidate: a fallback MUST be a
 * peer of the same tier and slot (similar capability and price class), never
 * an entry intended for a lower slot — falling back to a weaker model would
 * silently give the player less than the tier they chose.
 */
export type SlotCandidates = readonly [ModelEntryId, ...ModelEntryId[]]

type TierProfile = Record<Slot, SlotCandidates>

/**
 * Approved static profiles, not an inferred capability ordering. In particular
 * pro.mid uses high effort while pro.strong uses medium. Effort levels do not
 * establish cross-model rankings. Legacy metadata still maps to the same tier,
 * but future execution uses this table; stored ledger rows are never rewritten.
 */
const TIER_PROFILES: Record<TierId, TierProfile> = {
  pro: {
    strong: ["argon-medium"],
    mid: ["argon-high"],
    light: ["argon-low"],
  },
  balanced: {
    strong: ["argon-medium"],
    mid: ["argon-low"],
    light: ["flash-high"],
  },
  fast: {
    strong: ["flash-high"],
    mid: ["flash-medium"],
    light: ["lite-medium"],
  },
}

/**
 * Small, self-contained jobs that are not a role of any turn — naming a game,
 * for instance. They get their own candidates instead of a tier's slot on
 * purpose: which tier the player picked says how hard the model should think
 * about their game, not how a sidebar label is produced, so a pro player and
 * a fast player get the same title model. Swapping it means editing only the
 * list here, like `TIER_PROFILES`.
 */
export type UtilityTask = "title"

const UTILITY_MODELS: Record<UtilityTask, SlotCandidates> = {
  title: ["lite-minimal"],
}

export type ResolvedModel = {
  candidates: SlotCandidates
  primary: ModelEntry
  model: LanguageModel
}

/**
 * What to do when the browser did not say which tier a turn should run with,
 * or said something this server does not recognise.
 *
 * The id is checked again here even though `clientDataSchema` already parsed
 * it, because the fallback is the point: a turn arriving from an older tab, or
 * from a client sending nothing at all, should be answered on the default tier
 * rather than failing. The schema decides what is *allowed*; this decides what
 * to do when the answer is missing. It is the single rule the ledger and the
 * provider both use — see `readThreadTier` in `./message-model.ts` and every
 * call site in `trigger/chat.ts`.
 */
export function resolveTier(id: TierId | undefined): TierId {
  return isTierId(id) ? id : DEFAULT_TIER_ID
}

/**
 * The display name for whichever entry actually served a call — the
 * counterpart to `ServedCall.entryId` (`fallback-model.ts`'s `onServed`
 * report). A run's `modelId` already names the entry that served it; a
 * caller that also wants to show a human-readable name (`run-subagent.ts`'s
 * `SubagentRunRecord.modelName`) looks it up here rather than reusing a
 * slot's `primary.displayName`, which would be wrong the moment a fallback
 * ever takes over mid-turn.
 */
export function entryDisplayName(id: ModelEntryId): string {
  return REGISTRY[id].displayName
}

/**
 * A caller that never needs cross-call fallback state — a one-off resolution
 * with no turn to persist "already tried and failed" across — gets a
 * composite that still tries every candidate in order this one call, but
 * never remembers a failure past it and never reports who served. Every
 * caller inside a turn (`orchestratorModelSettings`, the sub-agent runner)
 * passes its own hooks backed by `turnState`; title generation, which runs
 * outside any turn, is the one that relies on this default.
 */
const NOOP_HOOKS: FallbackHooks = {
  isUnavailable: () => false,
  markUnavailable: () => {},
  onServed: () => {},
}

/**
 * The only path from a tier and a slot to a concrete model. Every role, the
 * orchestrator included, calls this rather than naming a model — see
 * decision 2 in `design.md`.
 *
 * `model` is a composite `LanguageModel` (`createFallbackModel`, decision 19)
 * that tries `candidates` in order, skipping any `hooks.isUnavailable` already
 * ruled out this turn. `hooks` is optional so a caller with no turn to key
 * state off can still call this — see `NOOP_HOOKS` above — but every call
 * that runs inside a real turn should pass hooks wired to `turnState`, or a
 * fallback that already happened this turn will not be remembered.
 *
 * Only `google-vertex` is installed, and it implements the v4 language model
 * spec — confirmed in `fallback-model.ts`'s 1c.0 gate note. The cast below
 * documents that assumption at its one call site; a future provider on a
 * different spec version needs this file revisited.
 */
export function resolveModel(
  tier: TierId,
  slot: Slot,
  hooks: FallbackHooks = NOOP_HOOKS,
  factory: typeof providerModel = providerModel
): ResolvedModel {
  return resolveCandidates(TIER_PROFILES[tier][slot], hooks, factory)
}

/**
 * The path from a utility task to a concrete model, bypassing tiers — see
 * `UTILITY_MODELS`. Same composite as `resolveModel`, so a second candidate
 * added there falls back exactly the way a slot's does.
 */
export function resolveUtilityModel(
  task: UtilityTask,
  hooks: FallbackHooks = NOOP_HOOKS,
  factory: typeof providerModel = providerModel
): ResolvedModel {
  return resolveCandidates(UTILITY_MODELS[task], hooks, factory)
}

function resolveCandidates(
  candidateIds: SlotCandidates,
  hooks: FallbackHooks,
  factory: typeof providerModel
): ResolvedModel {
  const primary = REGISTRY[candidateIds[0]]

  const candidates = candidateIds.map((id) => ({
    entry: REGISTRY[id],
    model: factory(REGISTRY[id]) as ConcreteLanguageModel,
  }))

  return { candidates: candidateIds, primary, model: createFallbackModel(candidates, hooks) }
}
