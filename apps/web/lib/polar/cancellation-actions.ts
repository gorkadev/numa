"use server"

import { refresh } from "next/cache"

import { requireSession } from "@/lib/session"
import { polar } from "@/lib/polar/client"
import {
  parseCancellationRequest,
  setCancellation,
  type CancellationDeps,
  type CancellationResult,
} from "@/lib/polar/cancellation"
import { activePaidSubscription, readCustomerState } from "@/lib/polar/plan"

/**
 * The subscription is always looked up from the session, never taken from the
 * browser, so a user can only ever cancel or resume their own plan.
 */
function depsFor(userId: string): CancellationDeps {
  return {
    activeSubscriptionId: async () => {
      const state = await readCustomerState(userId)
      return (state && activePaidSubscription(state)?.id) ?? null
    },
    update: async (id, subscriptionUpdate) => {
      await polar.subscriptions.update({ id, subscriptionUpdate })
    },
  }
}

export async function cancelSubscriptionAction(
  input: unknown
): Promise<CancellationResult | "invalid"> {
  const { user } = await requireSession()
  const request = parseCancellationRequest(input)
  if (!request) return "invalid"

  const result = await setCancellation(
    { cancel: true, ...request },
    depsFor(user.id)
  )
  if (result === "ok") refresh()
  return result
}

export async function resumeSubscriptionAction(): Promise<CancellationResult> {
  const { user } = await requireSession()

  const result = await setCancellation({ cancel: false }, depsFor(user.id))
  if (result === "ok") refresh()
  return result
}
