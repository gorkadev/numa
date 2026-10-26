/**
 * Tells a mounted improver button to read its allowance again — after the
 * overage setting changes in the settings dialog, which lives in another
 * subtree. Same `window` event pattern as `lib/polar/credits-channel.ts`, for
 * the same reason: two unrelated subtrees, one occasional notification.
 */
const EVENT = "numa:improver-allowance-stale"

export function publishImproverAllowanceStale(): void {
  if (typeof window === "undefined") return

  window.dispatchEvent(new Event(EVENT))
}

export function onImproverAllowanceStale(handler: () => void): () => void {
  window.addEventListener(EVENT, handler)

  return () => window.removeEventListener(EVENT, handler)
}
