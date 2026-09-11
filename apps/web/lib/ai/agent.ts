import type { TierId } from "./model-catalog"
import {
  resolveModel,
  resolveTier,
  type FallbackHooks,
  type ResolvedModel,
} from "./model-registry"

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
 * No `providerOptions` here, on purpose (corrected after a coordinator
 * review — see `fallback-model.ts`'s GATE note): `resolveModel`'s composite
 * is the sole owner of applying a candidate's own `providerOptions`, merged
 * onto whichever entry actually serves a given call. Setting the slot's
 * PRIMARY's options at this top level, the way an earlier version of this
 * function did, would hand them to a PEER serving as a fallback too — a peer
 * that rejects them (e.g. a reasoning-effort option it does not support) with
 * a validation error, which never falls back, turning a resilience feature
 * into a new way to break.
 *
 * `maxRetries: 0` for the same reason retries moved into the composite: the
 * composite now retries a candidate's own retryable failures itself
 * (`callCandidateWithRetry`), so leaving `ai`'s default `maxRetries` (2) would
 * retry the WHOLE composite call on top of that — doubling backoff delay and,
 * once every candidate is genuinely unavailable, doubling the number of
 * already-pointless attempts.
 *
 * `hooks` is required rather than defaulted here: `agent.ts` cannot import
 * `turnState` (see `resolveModel`'s note in `model-registry.ts`), so the one
 * caller that can — `trigger/chat.ts` — must always pass hooks wired to it,
 * or the `strong` slot's fallback state stops being remembered across the
 * turn's steps.
 */
export function orchestratorModelSettings(
  tier: TierId | undefined,
  hooks: FallbackHooks
): {
  model: ResolvedModel["model"]
  maxRetries: 0
} {
  const { model } = resolveModel(resolveTier(tier), "strong", hooks)

  return { model, maxRetries: 0 }
}
