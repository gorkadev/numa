import { z } from "zod"

/**
 * The tiers a player may build a game with, and everything the browser is
 * allowed to know about them.
 *
 * Client-safe on purpose: this module holds ids and copy, never a provider
 * instance, a provider model id or a rate. A picker imports it, the chat sends
 * the chosen tier up as client data, and the model registry (`./model-registry`,
 * server-only) is the only place that turns a tier into something that can call
 * a provider. Keeping the two apart is what stops a credentialed provider
 * instance — or its rate card — from being pulled into a client bundle by an
 * import of the label next to it.
 *
 * A tier is a power/budget choice, not a model. `resolveModel(tier, slot)` in
 * `./model-registry` is the only path from a tier to a concrete model, so
 * swapping the model behind any tier's slot never touches this file.
 */
export type Tier = {
  id: TierId
  label: string
  /** One line, shown under the label in a picker. */
  tagline: string
}

/**
 * The ids, as their own schema rather than a derived one.
 *
 * This is the validator the agent runs against `clientData`: the id arrives
 * from the browser, so the set of tiers a turn can run with has to be closed on
 * the server, not merely typed.
 */
export const tierIdSchema = z.enum(["pro", "balanced", "fast"])

export type TierId = z.infer<typeof tierIdSchema>

export const TIERS: readonly Tier[] = [
  {
    id: "pro",
    label: "Pro",
    tagline: "Slower and stronger, for mechanics that need real reasoning.",
  },
  {
    id: "balanced",
    label: "Balanced",
    tagline: "Fast and capable. The right pick for most games.",
  },
  {
    id: "fast",
    label: "Fast",
    tagline: "Cheapest and quickest, for small tweaks and quick iterations.",
  },
]

/**
 * What a game is built with until somebody chooses otherwise — the balanced
 * option, not the cheapest, because the first turn is the one that decides
 * whether the player keeps going. It is also the tier whose `strong` slot is
 * NOT the pro model (see `model-registry.ts`'s tier profiles), so the default
 * never bills a tweak at pro rates.
 */
export const DEFAULT_TIER_ID: TierId = "balanced"

export function isTierId(value: unknown): value is TierId {
  return tierIdSchema.safeParse(value).success
}

export function getTier(id: TierId): Tier {
  const tier = TIERS.find((candidate) => candidate.id === id)

  /**
   * Unreachable through the type, but `TIERS` and the schema are two lists
   * that have to be kept in step by hand — so a tier added to one and not the
   * other fails here rather than rendering a blank row.
   */
  if (!tier) throw new Error(`Unknown tier: ${id}`)

  return tier
}

/**
 * The raw Gemini model ids a thread could record before tiers existed — this
 * project's entire pre-tier history, since there is no production data.
 *
 * Kept as their own closed schema, distinct from the model registry's
 * `ModelEntryId`, because this file is client-safe and the registry is not: a
 * legacy thread's stored `model` field has to be read back into a tier without
 * this module ever importing the server-only registry it would otherwise
 * duplicate.
 */
export const legacyModelIdSchema = z.enum([
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
])

export type LegacyModelId = z.infer<typeof legacyModelIdSchema>

/**
 * The fixed, deterministic mapping from a legacy model id to the tier it
 * becomes. Each tier's `strong` entry in the registry equals the legacy model
 * that maps to it here, so a thread that predates tiers keeps running the same
 * concrete model it always did — see `message-model.ts`'s `readThreadTier`.
 */
export const LEGACY_MODEL_TIER: Record<LegacyModelId, TierId> = {
  "gemini-3.1-pro-preview": "pro",
  "gemini-3.8-flash": "balanced",
  "gemini-3.5-flash-lite": "fast",
}
