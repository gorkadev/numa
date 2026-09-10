import type { LanguageModelUsage } from "ai"

import type { GameModelId } from "./model-catalog"

/**
 * Server-only: what a turn is estimated to have cost.
 *
 * Nothing here may be imported from a client component — not because it holds a
 * credential, but because a rate card is not something the browser needs and a
 * price rendered client-side is a price somebody will eventually read as a
 * quote. The client-safe half of the model story is `./model-catalog`.
 *
 * Every number below is an ESTIMATE. This is a hand-maintained constant rather
 * than a live read of the Cloud Billing Catalog API on purpose: a product whose
 * cost basis changes silently at runtime is a far worse failure than one whose
 * cost basis changes in a reviewed pull request. A wrong rate here is a diff
 * somebody can see, argue with, and date.
 *
 * The accuracy of this table is meant to be checked, not assumed. The only
 * authority on what a turn cost is the Google bill; these rows exist so that
 * bill can be predicted and, when it arrives, explained.
 */

/**
 * Stamped onto every ledger row as `turn_usage.rate_version`.
 *
 * MUST be bumped whenever any rate below changes — including a scheduled change
 * that arrives on its own date. This string is the only thing that makes a
 * stored `cost_micro_usd` re-derivable later: without it, a row is a number
 * nobody can reproduce, and the whole ledger becomes anecdote.
 */
export const RATE_TABLE_VERSION = "2026-09-10"

/**
 * USD per 1M tokens. `cachedInput` is what a cache *read* costs; cache writes
 * and storage are not modelled at all, so a caching-heavy workload will be
 * under-estimated rather than over-estimated.
 *
 * The `cachedInput` figures — 0.20 for the flash tier, 0.40 for pro — are the
 * published Vertex Standard cached-input rates and are APPROXIMATE here: they
 * were not confirmed per-model, so they are applied as a tier-wide assumption
 * rather than a looked-up fact for each row.
 */
type ModelRate = {
  input: number
  output: number
  cachedInput: number
  /**
   * Set only for models whose rate changes with the size of the request. When
   * present, a prompt strictly larger than `threshold` input tokens is billed
   * at `input`/`output` from here instead.
   */
  longContext?: {
    threshold: number
    input: number
    output: number
  }
}

const RATES: Record<GameModelId, ModelRate> = {
  /**
   * VERIFIED against Google's published pricing.
   *
   * These are INTRODUCTORY rates and they expire: 0.75 / 3.75 holds through
   * 2026-12-31, and on 2027-01-01 the standard rates of 1.50 / 7.50 take
   * effect — a doubling, already scheduled, already known. This is not a risk
   * to monitor but a date to act on: on 2027-01-01 these two numbers change and
   * `RATE_TABLE_VERSION` is bumped with them, or every row written afterwards
   * records half of what the turn actually cost.
   */
  "gemini-3.8-flash": {
    input: 0.75,
    output: 3.75,
    cachedInput: 0.2,
  },

  /**
   * VERIFIED, and tiered by prompt size: 2.00 / 12.00 for a request up to 200K
   * input tokens, 4.00 / 18.00 above it.
   *
   * The tier is chosen by the size of the *request*, not by the length of the
   * reply — which is the trap. A long thread crosses 200K on its own, without
   * anybody doing anything different, and from that turn onward doubles its own
   * input rate and raises its output rate by half. The cost of a conversation
   * on this model is therefore not linear in its length, and the jump is
   * invisible unless it is recorded.
   */
  "gemini-3.1-pro-preview": {
    input: 2.0,
    output: 12.0,
    cachedInput: 0.4,
    longContext: {
      threshold: 200_000,
      input: 4.0,
      output: 18.0,
    },
  },

  /**
   * UNVERIFIED. These are placeholders, not facts.
   *
   * 0.10 / 0.40 were NOT confirmed against Google's pricing page for this
   * model. The closest published figures found were for Gemini *2.5* Flash
   * Lite, which is a different model and cannot be assumed to price the same.
   *
   * Every row this produces is therefore a guess wearing the same shape as a
   * measurement, which is exactly what this table is supposed to prevent. This
   * entry must be confirmed against the real pricing page — or against a bill —
   * before any price is set from a number it produced.
   */
  "gemini-3.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cachedInput: 0.2,
  },
}

/**
 * Every field of `LanguageModelUsage` is `number | undefined`, including the
 * nested detail objects' fields — a provider reports what it reports. Missing
 * is read as zero, which under-counts rather than inventing tokens.
 */
export function turnUsageTokens(usage: LanguageModelUsage): {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningTokens: number
} {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  }
}

/**
 * The turn's estimated cost, in whole micro-dollars.
 *
 * Two things here are easy to get wrong in opposite directions:
 *
 * Cached input is a SUBSET of `inputTokens`, not an addition to it. Billing the
 * full `inputTokens` at the input rate and then adding the cached tokens at the
 * cached rate charges those tokens twice. So the cached portion is subtracted
 * out first and only the remainder is billed at the full rate.
 *
 * Reasoning tokens are already INSIDE `outputTokens` — `outputTokenDetails`
 * splits that total into text and reasoning, it does not extend it. They are
 * recorded on the ledger row for visibility, but adding them to the output
 * charge would bill a thinking model twice for the part that makes it
 * expensive.
 *
 * Rounded up, so a turn that used tokens can never be recorded as free.
 */
export function turnCostMicroUsd({
  modelId,
  usage,
}: {
  modelId: GameModelId
  usage: LanguageModelUsage
}): number {
  const rate = RATES[modelId]
  const { inputTokens, outputTokens, cachedInputTokens } =
    turnUsageTokens(usage)

  /**
   * The tier is a property of the request that was sent, so it is decided by
   * the full input count — cached tokens included. They were part of the prompt
   * even though they cost less to read.
   */
  const tier =
    rate.longContext && inputTokens > rate.longContext.threshold
      ? rate.longContext
      : rate

  /**
   * `Math.max` guards a provider that reports more cached tokens than input
   * tokens. That should not happen; if it does, the answer is zero billable
   * uncached input, not a negative charge quietly cancelling out the output.
   */
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens)

  /**
   * No unit conversion, and that is not an oversight. A rate is USD per 1M
   * tokens, so `tokens * rate` is USD × 10⁻⁶ — micro-dollars already. Dividing
   * by 1e6 to get dollars and multiplying back would only round-trip the value
   * through a float for nothing.
   */
  const microUsd =
    uncachedInputTokens * tier.input +
    cachedInputTokens * rate.cachedInput +
    outputTokens * tier.output

  return Math.ceil(microUsd)
}

/**
 * Micro-dollars of retail value in one credit: a credit is one US cent of what
 * the customer is charged, not one cent of what Google charged us.
 */
export const MICRO_USD_PER_CREDIT = 10_000

/**
 * How many times the estimated cost of a turn the customer pays for it.
 *
 * Covered by `RATE_TABLE_VERSION` along with everything else in this file, and
 * that coupling is the point of it living here rather than next to the checkout
 * or the meter. Changing this number changes what an already-stored
 * `turn_usage.credits` means — the same row now describes a turn sold under
 * different economics — so the version stamped beside it must be bumped in the
 * same commit. A markup change that leaves the version alone makes every
 * historical row silently unexplainable.
 */
export const CREDIT_MARKUP = 3

/**
 * What one turn costs the customer, in credits.
 *
 * A credit is a unit of PRICE, and this function is the one place cost becomes
 * price. That indirection is the whole point, and it is easiest to see through
 * the rate change this file already knows about: `gemini-3.8-flash` doubles on
 * 2027-01-01 when its introductory pricing ends. On that date the identical
 * turn — same prompt, same reply, same token counts — costs twice as much to
 * serve and therefore consumes twice the credits. The margin holds without the
 * customer-facing price of a credit moving at all, because the product is sold
 * in credits and credits track value spent, not tokens burned.
 *
 * The alternative — pricing in tokens — inverts that. Every rate change on
 * Google's side would silently re-price the product: a doubling would halve the
 * margin, a discount would give it away, and neither would appear anywhere as a
 * pricing decision because nobody made one. Cost has to be allowed to move
 * without the price list moving with it.
 *
 * Rounded up, so a turn that cost anything at all cannot be free. A turn that
 * genuinely cost nothing consumes nothing, and callers use that zero to skip
 * metering entirely.
 */
export function turnCreditCost({
  modelId,
  usage,
}: {
  modelId: GameModelId
  usage: LanguageModelUsage
}): number {
  const costMicroUsd = turnCostMicroUsd({ modelId, usage })

  return Math.ceil((costMicroUsd * CREDIT_MARKUP) / MICRO_USD_PER_CREDIT)
}
