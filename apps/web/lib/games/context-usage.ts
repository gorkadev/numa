import type { UIMessageChunk } from "ai"

import { entryContextWindow, type ModelEntryId } from "@/lib/ai/model-registry"

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
 * Takes the entry that SERVED the step, not the tier's primary: after a
 * fallback the two can disagree and the percentage would be measured against
 * the wrong window.
 */
export function contextUsageOf(
  inputTokens: number | undefined,
  entryId: ModelEntryId
): ContextUsage | null {
  if (!inputTokens || inputTokens <= 0) return null

  return { tokens: inputTokens, window: entryContextWindow(entryId) }
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
