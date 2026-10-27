/**
 * Scheduling and undoing a subscription cancellation from inside the app.
 *
 * Kept free of `@/` imports and the Polar client so the rules can be tested
 * with fakes; `./cancellation-actions` wires the real dependencies in.
 */

/** Polar's `CustomerCancellationReason`, the values the dialog offers. */
export const CANCELLATION_REASONS = [
  "too_expensive",
  "missing_features",
  "low_quality",
  "too_complex",
  "unused",
  "switched_service",
  "customer_service",
  "other",
] as const

export type CancellationReason = (typeof CANCELLATION_REASONS)[number]

export const CANCELLATION_COMMENT_MAX_LENGTH = 1000

export type CancellationRequest = {
  reason: CancellationReason
  comment: string | null
}

/**
 * Validates what the browser sent. Anything unexpected is `null`: the action
 * arrives from a client, so a reason outside Polar's enum is never forwarded.
 */
export function parseCancellationRequest(
  raw: unknown
): CancellationRequest | null {
  if (typeof raw !== "object" || raw === null) return null

  const { reason, comment } = raw as { reason?: unknown; comment?: unknown }

  if (!CANCELLATION_REASONS.includes(reason as CancellationReason)) return null
  if (comment !== undefined && comment !== null && typeof comment !== "string")
    return null

  const trimmed = typeof comment === "string" ? comment.trim() : ""
  if (trimmed.length > CANCELLATION_COMMENT_MAX_LENGTH) return null

  return { reason: reason as CancellationReason, comment: trimmed || null }
}

export type CancellationUpdate =
  | {
      cancelAtPeriodEnd: true
      customerCancellationReason: CancellationReason
      customerCancellationComment: string | null
    }
  | { cancelAtPeriodEnd: false }

export type CancellationDeps = {
  /** The signed-in user's active Pro or Max subscription, or `null`. */
  activeSubscriptionId: () => Promise<string | null>
  update: (subscriptionId: string, body: CancellationUpdate) => Promise<void>
}

export type CancellationResult = "ok" | "no_subscription" | "failed"

/**
 * Cancels at the end of the current period, never immediately: the customer
 * already paid for it, so they keep the plan and its credits until then and
 * can resume at any point before it ends.
 */
export async function setCancellation(
  change: ({ cancel: true } & CancellationRequest) | { cancel: false },
  deps: CancellationDeps
): Promise<CancellationResult> {
  try {
    const subscriptionId = await deps.activeSubscriptionId()
    if (!subscriptionId) return "no_subscription"

    await deps.update(
      subscriptionId,
      change.cancel
        ? {
            cancelAtPeriodEnd: true,
            customerCancellationReason: change.reason,
            customerCancellationComment: change.comment,
          }
        : { cancelAtPeriodEnd: false }
    )

    return "ok"
  } catch (error) {
    console.error("Failed to update the subscription cancellation", error)
    return "failed"
  }
}
