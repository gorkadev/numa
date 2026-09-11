import { APICallError, type LanguageModel } from "ai"

import type { ModelEntry, ModelEntryId } from "./model-registry"

/**
 * Task 1c.0 (GATE) finding, recorded before this file was written; the retry
 * ownership section was corrected after a coordinator review of the first
 * version (see the note it references).
 *
 * `providerOptions` DOES reach the wrapped model's `doGenerate`/`doStream`
 * options. Traced in the installed `ai@7.0.93`
 * (`node_modules/.pnpm/ai@7.0.93_zod@4.4.3/node_modules/ai/dist/index.js`):
 * `generateText`'s step loop builds `stepProviderOptions =
 * mergeObjects(providerOptions, prepareStepResult?.providerOptions)` (line
 * ~5874) and calls `stepModel.doGenerate({ ..., providerOptions:
 * stepProviderOptions, ... })` (line ~5934) — the exact value `streamText`'s
 * top-level `providerOptions` option receives, unmodified, on the call
 * options object every model implementation receives. `streamObject`'s
 * `doStream` call path (line ~14644) builds an equivalent `callOptions`
 * object the same way. Neither path special-cases `LanguageModel`
 * implementations, so this composite receives its `providerOptions` through
 * the same, single documented path every other model does — no separate
 * plumbing was needed to make it work. This composite is now the SOLE owner
 * of merging a candidate's own `providerOptions` in (see
 * `withEntryProviderOptions` below): the caller (`agent.ts`) no longer sets
 * `providerOptions` at the top level of `streamText`'s options, because that
 * would have applied the slot's PRIMARY's options to a PEER serving as a
 * fallback — a peer with no matching provider options of its own could
 * reject them outright as a validation error, which never falls back.
 *
 * The interface version differs from design.md's Technical Approach section,
 * which referenced `LanguageModelV2`: the only installed provider,
 * `@ai-sdk/google-vertex@5.0.76` (via `@ai-sdk/google@4.0.64`), implements
 * `specificationVersion: "v4"` (`node_modules/.pnpm/@ai-sdk+google@4.0.64_zod@4.4.3/node_modules/@ai-sdk/google/dist/index.d.ts:722`),
 * and the only `@ai-sdk/provider` version present in the lockfile is `4.0.10`,
 * whose exported types are actually the v2/v3/v4 spec family (the npm version
 * number and the spec version name are unrelated). `ai` itself normalizes any
 * of v2/v3/v4 to v4 internally before use (`asLanguageModelV4`,
 * `dist/index.js:854-867`), so a v2 implementation would have worked too, but
 * since every real candidate here is already v4, this composite implements
 * `specificationVersion: "v4"` directly and forwards call options to its
 * candidates completely unchanged — no cross-version translation is needed.
 * `@ai-sdk/provider` is not a direct dependency of this app (only transitive,
 * exactly like `@ai-sdk/provider-utils`'s `ProviderOptions` noted in
 * `model-registry.ts`), so the exact v4 call-option and result types are
 * derived structurally from `ai`'s own exported `LanguageModel` union below,
 * the same technique already used there, rather than adding an undeclared
 * dependency. This does mean a future provider on a different spec version
 * needs this file (and the cast in `model-registry.ts`'s `resolveModel`)
 * revisited — out of scope while only Vertex is installed.
 *
 * Retry ownership, corrected: `ai`'s own retry (`retryWithExponentialBackoff`,
 * wrapping calls like `retry(() => stepModel.doGenerate(...))`,
 * `dist/index.js:5921-5934`) wraps the WHOLE model call — i.e. this whole
 * composite — not an individual candidate's call. The first version of this
 * file read decision 19's "only after the SDK's own maxRetries on that
 * candidate" as something `ai`'s own outer retry would supply for free, and
 * fell back to the next candidate on the FIRST error. That broke the spec and
 * regressed resilience: with today's single-candidate profiles, a transient
 * 429/5xx immediately exhausted the only candidate, and the second call (from
 * `ai`'s own outer retry) found no viable candidate left and threw a plain,
 * non-retryable `Error` — so a transient failure that used to be retried with
 * backoff instead failed the turn outright. This composite now owns retrying
 * a RETRYABLE availability error against the SAME candidate itself
 * (`callCandidateWithRetry` below, bounded backoff mirroring `ai`'s own
 * default: 2 retries, 2s initial delay, factor 2) and only marks a candidate
 * unavailable once its own retries are exhausted, or immediately for an
 * availability error that is not retryable at all (a 404 model-not-found, for
 * one — matching the primary verification scenario: an invalid
 * `providerModelId` is a 404, so the SDK would not have retried it either,
 * meaning zero retries then an immediate fallback is still correct there).
 * Because retries are now owned here, `agent.ts`/`trigger/chat.ts` set
 * `maxRetries: 0` on the orchestrator's `streamText` call, so `ai`'s own
 * outer retry never doubles up on top of this composite's own.
 */

export type ServedCall = {
  entryId: ModelEntryId
  /** Set only when a peer served instead of the slot's configured primary. */
  fallbackFrom?: ModelEntryId
}

/**
 * How `resolveModel`'s caller lets this composite read and update per-turn
 * state it must never import directly: `lib/games/harness/turn-state.ts`
 * depends on `lib/ai`, never the other way around (see the `AgentUsageEntry`
 * note in `pricing.ts`). `resolveModel`'s caller is what actually knows about
 * `turnState`, and wires these three operations to it.
 */
export type FallbackHooks = {
  isUnavailable: (id: ModelEntryId) => boolean
  markUnavailable: (id: ModelEntryId) => void
  onServed: (served: ServedCall) => void
}

/**
 * The exact shape `ai` normalizes every model call to — see the GATE note
 * above. Derived from `ai`'s own exported `LanguageModel` union rather than
 * importing `@ai-sdk/provider` directly, the same technique `model-registry.ts`
 * already uses for `ProviderOptions`.
 */
export type ConcreteLanguageModel = Extract<
  LanguageModel,
  { specificationVersion: "v4" }
>

type CallOptions = Parameters<ConcreteLanguageModel["doGenerate"]>[0]
type ProviderOptionsRecord = Record<string, Record<string, unknown>>

type Candidate = { entry: ModelEntry; model: ConcreteLanguageModel }

/** Mirrors `ai`'s own default retry policy — see the GATE note above. */
const MAX_RETRIES_PER_CANDIDATE = 2
const INITIAL_RETRY_DELAY_MS = 2000
const RETRY_BACKOFF_FACTOR = 2

/**
 * Decision 19's classification: a retryable provider error, model-not-found,
 * rate limit, or server error. Network and connect-timeout failures are
 * already folded into a retryable `APICallError` by `@ai-sdk/provider-utils`'s
 * fetch wrapper before they ever reach a model implementation
 * (`node_modules/.pnpm/@ai-sdk+provider-utils@5.0.36_zod@4.4.3/node_modules/@ai-sdk/provider-utils/dist/index.js:476-511`),
 * so checking `APICallError` alone covers every case decision 19 lists.
 */
const AVAILABILITY_STATUS_CODES = new Set([404, 429, 500, 502, 503, 504])

function isAvailabilityError(error: unknown): boolean {
  if (!(error instanceof APICallError)) return false
  if (error.isRetryable) return true

  return error.statusCode != null && AVAILABILITY_STATUS_CODES.has(error.statusCode)
}

/**
 * Only `isRetryable` errors get the SAME candidate retried with backoff
 * (`callCandidateWithRetry`). An availability error that is NOT retryable —
 * a 404 model-not-found is the case this codebase actually exercises — is
 * still an availability error (`isAvailabilityError` above), but retrying the
 * identical request against the identical, permanently-missing model would
 * never succeed, so it falls back to the next candidate immediately instead.
 */
function isRetryableError(error: unknown): boolean {
  return error instanceof APICallError && error.isRetryable === true
}

/**
 * An abort must never trigger a retry or a fallback (decision 19): retrying,
 * or falling back, on a call the caller asked to stop would produce output
 * nobody wants, on someone else's bill. Duck-typed rather than
 * `instanceof Error`/`instanceof DOMException`, because an aborted `fetch`
 * can surface either depending on the runtime.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  )
}

/**
 * Resolves after `ms`, or rejects immediately if `signal` is already aborted,
 * or the moment it aborts during the wait — so a backoff delay can never
 * outlive the caller's own abort and turn into unwanted extra latency, let
 * alone an unwanted retry once it resolves.
 */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"))
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error("Aborted"))
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Merges a candidate's own `providerOptions` on top of whatever the caller
 * already set, per provider key — not a shallow replace of the whole
 * `providerOptions` object, which would have thrown away every OTHER
 * provider's caller-supplied options the moment any candidate declared its
 * own. The entry's inner keys win over the caller's for the SAME provider key
 * (decision 18: the entry's options travel with it to every call made on it),
 * but a caller-supplied option for a provider key the entry says nothing
 * about survives untouched.
 */
function mergeProviderOptions(
  base: CallOptions["providerOptions"],
  entryOptions: NonNullable<ModelEntry["providerOptions"]>
): CallOptions["providerOptions"] {
  const merged: ProviderOptionsRecord = { ...(base as ProviderOptionsRecord | undefined) }
  const entryRecord = entryOptions as ProviderOptionsRecord

  for (const providerKey of Object.keys(entryRecord)) {
    merged[providerKey] = { ...merged[providerKey], ...entryRecord[providerKey] }
  }

  return merged as CallOptions["providerOptions"]
}

/**
 * Applies a candidate's own `providerOptions`, if it declares any. This is
 * now the ONLY place a candidate's `providerOptions` gets applied — `agent.ts`
 * stopped passing the slot's primary's `providerOptions` at the top level of
 * `streamText`'s options, so a peer serving as a fallback is never handed
 * options that belong to a different entry (see the GATE note above).
 */
function withEntryProviderOptions(options: CallOptions, entry: ModelEntry): CallOptions {
  if (!entry.providerOptions) return options

  return {
    ...options,
    providerOptions: mergeProviderOptions(options.providerOptions, entry.providerOptions),
  }
}

/**
 * Calls one candidate, retrying it with bounded exponential backoff on its
 * own retryable availability errors (decision 19, corrected per the GATE
 * note above) — never on an abort, and never past `MAX_RETRIES_PER_CANDIDATE`.
 * Any other outcome (success, a non-retryable availability error, a
 * content/validation error, or an abort) resolves or rejects straight through
 * to the caller, which decides what to do next.
 */
async function callCandidateWithRetry<T>(
  candidate: Candidate,
  options: CallOptions,
  call: (model: ConcreteLanguageModel, options: CallOptions) => PromiseLike<T>
): Promise<T> {
  const callOptions = withEntryProviderOptions(options, candidate.entry)
  let delayMs = INITIAL_RETRY_DELAY_MS

  for (let attempt = 0; ; attempt++) {
    try {
      return await call(candidate.model, callOptions)
    } catch (error) {
      if (isAbortError(error)) throw error
      if (!isRetryableError(error) || attempt >= MAX_RETRIES_PER_CANDIDATE) throw error

      await delay(delayMs, options.abortSignal)
      delayMs *= RETRY_BACKOFF_FACTOR
    }
  }
}

/**
 * The composite `LanguageModel` behind `resolveModel` (decision 19): tries a
 * slot's candidates in order, retrying the current one on its own retryable
 * failures, and only falling back to the next candidate — never already
 * marked unavailable this turn — once the current one's retries are
 * exhausted, or immediately on an availability error that was never
 * retryable to begin with (a 404, for one).
 *
 * Streaming calls are never inspected mid-flight: once a candidate's
 * `doStream` call resolves at all, its `ReadableStream` is returned exactly
 * as received. Any error emitted later, inside that stream, is a
 * "failure after output started" per decision 19's own scenario, and is
 * deliberately left for the caller to see — not intercepted, and not retried,
 * here.
 */
export function createFallbackModel(
  candidates: readonly Candidate[],
  hooks: FallbackHooks
): ConcreteLanguageModel {
  const primary = candidates[0]

  if (!primary) {
    throw new Error("createFallbackModel requires at least one candidate")
  }

  const primaryId = primary.entry.id
  const primaryModel = primary.model

  /**
   * The real provider error behind the last candidate this composite gave up
   * on. Persists across calls on this same composite instance — including
   * `ai`'s own outer retries of the whole composite, since those call the
   * SAME object repeatedly rather than constructing a new one (see the GATE
   * note) — so that if every candidate is already unavailable by the time a
   * later call comes in, the caller still sees a real provider error instead
   * of a synthetic one. Only stays `undefined` if this exact composite
   * instance never itself saw a candidate fail — e.g. every candidate was
   * already marked unavailable by an EARLIER composite instance on the same
   * turn — in which case there is no real error to hand back and the
   * synthetic fallback below is the honest answer.
   */
  let lastFailure: unknown

  async function attempt<T>(
    options: CallOptions,
    call: (model: ConcreteLanguageModel, options: CallOptions) => PromiseLike<T>
  ): Promise<T> {
    const viable = candidates.filter((candidate) => !hooks.isUnavailable(candidate.entry.id))

    if (viable.length === 0) {
      throw (
        lastFailure ??
        new Error(`Every candidate for this slot is unavailable this turn (primary: ${primaryId})`)
      )
    }

    for (const candidate of viable) {
      try {
        const result = await callCandidateWithRetry(candidate, options, call)

        hooks.onServed({
          entryId: candidate.entry.id,
          fallbackFrom: candidate.entry.id === primaryId ? undefined : primaryId,
        })

        return result
      } catch (error) {
        if (isAbortError(error) || !isAvailabilityError(error)) throw error

        lastFailure = error
        hooks.markUnavailable(candidate.entry.id)
      }
    }

    throw lastFailure
  }

  return {
    specificationVersion: "v4",
    /**
     * Static identity for `ai`'s own logging/telemetry, not for billing: it
     * always names the slot's configured primary, even on a turn where a
     * fallback served. Billing reads `hooks.onServed`'s report instead, which
     * always names whichever entry actually ran (decision 19).
     */
    provider: primaryModel.provider,
    modelId: primaryModel.modelId,
    /**
     * All current candidates share one provider (Vertex), so the primary's
     * declared URL support stands in for the whole slot. Revisit if a slot
     * ever mixes providers with different URL support.
     */
    supportedUrls: primaryModel.supportedUrls,
    doGenerate: (options) => attempt(options, (model, opts) => model.doGenerate(opts)),
    doStream: (options) => attempt(options, (model, opts) => model.doStream(opts)),
  }
}
