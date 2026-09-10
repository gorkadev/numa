import type { UIMessageChunk } from "ai"

/**
 * The custom stream part the agent writes when a turn is over, carrying what
 * that turn cost in credits.
 *
 * # Why the agent tells the browser, instead of the browser asking Polar
 *
 * Because the agent is the only party that KNOWS. The credit cost of a turn is
 * derived from the token usage the provider reported for it (see
 * `lib/ai/pricing.ts`), and that number exists inside the run and nowhere
 * else until it has travelled to Polar and Polar's meter has caught up —
 * between four and ten seconds later, per the note in `lib/polar/balance.ts`.
 * A sidebar that refetched the balance the instant a turn finished would
 * faithfully render the balance from BEFORE the turn, which reads to the user
 * as "my credits did not move", i.e. as a bug in the thing they just paid for.
 *
 * Sending the delta down the stream that is already open costs one small chunk
 * and no extra call to anyone. It is what makes the number in the sidebar move
 * at the moment the turn ends.
 *
 * # It is a delta, not a balance
 *
 * Deliberately. The run cannot quote an authoritative balance — reading one
 * mid-turn would be the same stale number for the same reason — but it knows
 * exactly what it just spent. The client subtracts, and reconciles against
 * Polar shortly after. Optimism here is safe because it is bounded: the guess
 * is wrong for a few seconds at most, and always in the direction of showing
 * less credit than the user has.
 */
const PART_TYPE = "data-turn-credits"

/**
 * The stream part, ready to hand to a `ChatWriter`.
 *
 * `transient` for the same reason `gameRevisionChunk` is: this is a
 * notification about the account, not a piece of the conversation. Persisting
 * it would replay the deduction on every reload of the game — the sidebar
 * would subtract the same turn again — and would feed a cost report back into
 * the model's own history on the next turn.
 */
export function turnCreditsChunk(credits: number): UIMessageChunk {
  return { type: PART_TYPE, data: { credits }, transient: true }
}

/**
 * The credits carried by a stream part, or `null` for any other part.
 *
 * `unknown`-shaped input for the same reason as `readGameRevision`: `onData`
 * hands over every custom part the agent writes and this one crossed a network
 * boundary, so its contents are checked rather than asserted.
 */
export function readTurnCredits(part: {
  type: string
  data?: unknown
}): number | null {
  if (part.type !== PART_TYPE) return null

  const { data } = part

  if (typeof data !== "object" || data === null) return null

  const credits = (data as { credits?: unknown }).credits

  return typeof credits === "number" ? credits : null
}
