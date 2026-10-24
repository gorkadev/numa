import type { UIMessageChunk } from "ai"

/**
 * How full the orchestrator's context window was at its latest step.
 *
 * `tokens` is that step's reported INPUT, never a sum over steps or turns:
 * `priceTurn` adds every step's input together, which is what a turn is billed
 * for but says nothing about how much of the window the next request starts
 * with. The latest step's input is the prompt the model last saw, so it is the
 * one number that moves down again when compaction shrinks the history.
 */
export type ContextUsage = {
  tokens: number
  /** The serving model's window, resolved on the server so the browser keeps no model table. */
  window: number
}

const PART_TYPE = "data-context-usage"

/**
 * The reading for one finished step, or `null` when the provider reported no
 * input for it. Callers keep the previous reading in that case rather than
 * replacing a real number with zero.
 *
 * The window is a parameter, not looked up here: this module is imported by
 * the browser, and the model registry that knows windows pulls in the Vertex
 * provider, which cannot be bundled for the client. The server caller passes
 * `entryContextWindow(<entry that SERVED the step>)` — the served entry, not
 * the tier's primary, because after a fallback the two can disagree and the
 * percentage would be measured against the wrong window.
 */
export function contextUsageOf(
  inputTokens: number | undefined,
  window: number
): ContextUsage | null {
  if (!inputTokens || inputTokens <= 0) return null

  return { tokens: inputTokens, window }
}

/**
 * Transient for the same reason `turnCreditsChunk` is: it is a live reading,
 * not a piece of the conversation. The durable copy rides on the reply's
 * metadata (`withTurnMeta`), which is what survives a reload.
 */
export function contextUsageChunk(usage: ContextUsage): UIMessageChunk {
  return { type: PART_TYPE, data: usage, transient: true }
}

/**
 * The reading carried by a stream part, or `null` for any other part.
 * Checked rather than asserted: `onData` hands over every custom part and this
 * one crossed a network boundary.
 */
export function readContextUsage(part: {
  type: string
  data?: unknown
}): ContextUsage | null {
  if (part.type !== PART_TYPE) return null

  const { data } = part

  if (typeof data !== "object" || data === null) return null

  const { tokens, window } = data as { tokens?: unknown; window?: unknown }

  if (typeof tokens !== "number" || typeof window !== "number") return null

  return window > 0 ? { tokens, window } : null
}
