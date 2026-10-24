/**
 * Whether a message's actions row (time, copy, receipt) is rendered yet.
 *
 * An assistant reply withholds it while the turn is live: the row reports a
 * token count and a tool tally that are wrong until the turn lands. A player's
 * message has nothing of the kind, only a time and a copy button that are known
 * the moment it is sent, so it keeps the row from the start.
 *
 * The row takes its space even while it is invisible (it fades in on hover), so
 * adding it later is not free: it used to appear once the reply began, which
 * pushed the thinking indicator down by the row's height.
 */
export function showsMessageActions({
  role,
  live,
  hasMessage,
}: {
  role: "user" | "assistant"
  /** The turn is streaming or its stream is being reconnected. */
  live: boolean
  hasMessage: boolean
}): boolean {
  if (!hasMessage) return false

  return role === "user" || !live
}
