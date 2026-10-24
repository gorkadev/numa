import type { UIMessage } from "ai"

import { readMessageMeta, type MessageMeta } from "./message-meta"

/**
 * What a chat has spent so far, in the terms a usage footer shows.
 *
 * `input` includes `cached`: cached tokens are a SUBSET of the input the
 * provider reports (see `turnUsageTokens` in `./pricing`), so `total` adds
 * input and output only and `uncached` is what is left of input.
 */
export type SessionUsage = {
  total: number
  input: number
  cached: number
  uncached: number
  output: number
  /** Share of input served from cache, 0..1. */
  cacheHit: number
}

/**
 * Sums the per-turn receipts `withTurnMeta` stamped on assistant messages.
 *
 * Read from the messages the browser already holds rather than from
 * `turn_usage`: both come from the same `priceTurn` result, and this updates
 * the instant a turn ends with no extra request. Messages without token
 * metadata (user messages, threads from before receipts existed) contribute
 * nothing; a thread with no priced turn at all returns `null` so the caller
 * can hide the footer rather than show zeros.
 */
export function sumSessionUsage(messages: UIMessage[]): SessionUsage | null {
  let input = 0
  let output = 0
  let cached = 0
  let priced = false

  for (const message of messages) {
    if (message.role !== "assistant") continue

    const { tokens } = readMessageMeta(message)

    if (!tokens) continue

    priced = true
    input += tokens.input
    output += tokens.output
    cached += tokens.cached
  }

  if (!priced) return null

  return {
    total: input + output,
    input,
    cached,
    uncached: input - cached,
    output,
    cacheHit: input === 0 ? 0 : cached / input,
  }
}

/**
 * The context-window reading `withTurnMeta` stamped on the newest reply that
 * has one, or `null` for a thread with none (every reply predates the reading,
 * or no turn has finished yet).
 *
 * The newest wins rather than a sum: it is where the window stands now, and it
 * shrinks again when compaction trims the history.
 */
export function latestContextUsage(
  messages: UIMessage[]
): NonNullable<MessageMeta["context"]> | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]

    if (message?.role !== "assistant") continue

    const { context } = readMessageMeta(message)

    if (context) return context
  }

  return null
}
