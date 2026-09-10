import type { TierId } from "./model-catalog"
import { resolveModel, resolveTier, type ResolvedModel } from "./model-registry"

/**
 * Turns whatever the browser said the tier was into the `streamText` options
 * the orchestrator runs with this turn.
 *
 * The orchestrator always runs the tier's `strong` slot — it routes, does
 * tweaks itself, and writes every reply the player sees, so its quality is the
 * baseline. `resolveTier` supplies the default for a turn that named no tier
 * at all or named one this server does not recognise; `resolveModel` is then
 * the only path from that tier to a concrete model (decisions 2 and 18).
 *
 * `providerOptions` rides along from the resolved entry: a slot's primary can
 * declare reasoning effort or another per-call option, and it has to reach
 * every call made on it without this function — or its caller — knowing that
 * option exists.
 */
export function orchestratorModelSettings(
  tier: TierId | undefined
): {
  model: ResolvedModel["model"]
  providerOptions: ResolvedModel["primary"]["providerOptions"]
} {
  const { model, primary } = resolveModel(resolveTier(tier), "strong")

  return { model, providerOptions: primary.providerOptions }
}
