import "server-only"

import {
  activeSubscriptionsForProduct,
  summarizeBillingState,
} from "@/lib/polar/plan"

import { polar } from "./client"
import {
  POLAR_METER_ID,
  POLAR_PRODUCT_MAX_ID,
  POLAR_PRODUCT_PRO_ID,
} from "./products"

export type BillingDetails = {
  customer: "available" | "missing" | "unavailable"
  plan: ReturnType<typeof summarizeBillingState>["plan"]
  subscription: {
    availability: "available" | "none" | "unavailable"
    status: string | null
    amount: number | null
    currency: string | null
    cadence: { interval: string; count: number } | null
    currentPeriod: { start: string; end: string } | null
    credits: number | null
    cancellation: { at: string } | null
    pendingProductChange: { at: string } | null
    renewal: { at: string } | null
    nextEvent: {
      type: "cancellation" | "product_change" | "renewal"
      at: string
    } | null
  }
  recentOrders: {
    availability: "available" | "unavailable"
    items: Array<{
      createdAt: string
      status: string
      amount: number
      currency: string
      description: string
      invoiceHref: string | null
      receiptHref: string | null
    }>
  }
}

type CustomerState = Awaited<
  ReturnType<typeof polar.customers.getStateExternal>
>
type Subscription = Awaited<ReturnType<typeof polar.subscriptions.get>>

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  )
}

function date(value: Date): string {
  return value.toISOString()
}

function nextEvent(
  subscription: Subscription
): BillingDetails["subscription"]["nextEvent"] {
  if (subscription.cancelAtPeriodEnd) {
    return {
      type: "cancellation",
      at: date(subscription.endsAt ?? subscription.currentPeriodEnd),
    }
  }

  if (subscription.pendingUpdate?.productId) {
    return {
      type: "product_change",
      at: date(subscription.pendingUpdate.appliesAt),
    }
  }

  return { type: "renewal", at: date(subscription.currentPeriodEnd) }
}

function unavailableSubscription(
  credits: number | null
): BillingDetails["subscription"] {
  return {
    availability: "unavailable",
    status: null,
    amount: null,
    currency: null,
    cadence: null,
    currentPeriod: null,
    credits,
    cancellation: null,
    pendingProductChange: null,
    renewal: null,
    nextEvent: null,
  }
}

function noSubscription(
  credits: number | null
): BillingDetails["subscription"] {
  return {
    availability: "none",
    status: null,
    amount: null,
    currency: null,
    cadence: null,
    currentPeriod: null,
    credits,
    cancellation: null,
    pendingProductChange: null,
    renewal: null,
    nextEvent: null,
  }
}

function serializeSubscription(
  subscription: Subscription,
  credits: number | null
): BillingDetails["subscription"] {
  return {
    availability: "available",
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    cadence: {
      interval: subscription.recurringInterval,
      count: subscription.recurringIntervalCount,
    },
    currentPeriod: {
      start: date(subscription.currentPeriodStart),
      end: date(subscription.currentPeriodEnd),
    },
    credits,
    cancellation: subscription.cancelAtPeriodEnd
      ? { at: date(subscription.endsAt ?? subscription.currentPeriodEnd) }
      : null,
    pendingProductChange: subscription.pendingUpdate?.productId
      ? { at: date(subscription.pendingUpdate.appliesAt) }
      : null,
    renewal: subscription.cancelAtPeriodEnd
      ? null
      : { at: date(subscription.currentPeriodEnd) },
    nextEvent: nextEvent(subscription),
  }
}

function orderHref(orderId: string, document: "invoice" | "receipt"): string {
  return `/api/billing/orders/${encodeURIComponent(orderId)}/${document}`
}

function selectedPaidSubscription(state: CustomerState): {
  plan: "max" | "pro"
  subscription: CustomerState["activeSubscriptions"][number]
} | null {
  const max = activeSubscriptionsForProduct(state, POLAR_PRODUCT_MAX_ID)[0]

  if (max) return { plan: "max", subscription: max }

  const pro = activeSubscriptionsForProduct(state, POLAR_PRODUCT_PRO_ID)[0]

  return pro ? { plan: "pro", subscription: pro } : null
}

async function readCustomerState(
  userId: string
): Promise<
  | { status: "available"; state: CustomerState }
  | { status: "missing" | "unavailable" }
> {
  try {
    return {
      status: "available",
      state: await polar.customers.getStateExternal({ externalId: userId }),
    }
  } catch (error) {
    return { status: isNotFound(error) ? "missing" : "unavailable" }
  }
}

/**
 * Reads the signed-in user's billing facts from Polar and reduces them to values
 * safe for a browser. Provider credentials, portal sessions, and document URLs
 * intentionally never cross this boundary.
 */
export async function getBillingDetails(
  userId: string
): Promise<BillingDetails> {
  const [customerResult, ordersResult] = await Promise.allSettled([
    readCustomerState(userId),
    polar.orders.list({
      externalCustomerId: userId,
      limit: 5,
      sorting: ["-created_at"],
    }),
  ])

  const customer =
    customerResult.status === "fulfilled"
      ? customerResult.value
      : { status: "unavailable" as const }

  const recentOrders: BillingDetails["recentOrders"] =
    ordersResult.status === "fulfilled"
      ? {
          availability: "available",
          items: ordersResult.value.result.items.map((order) => ({
            createdAt: date(order.createdAt),
            status: order.status,
            amount: order.totalAmount,
            currency: order.currency,
            description: order.description,
            invoiceHref: order.isInvoiceGenerated
              ? orderHref(order.id, "invoice")
              : null,
            receiptHref: order.receiptNumber
              ? orderHref(order.id, "receipt")
              : null,
          })),
        }
      : { availability: "unavailable", items: [] }

  if (customer.status !== "available") {
    return {
      customer: customer.status,
      plan: "none",
      subscription: unavailableSubscription(null),
      recentOrders,
    }
  }

  const paid = selectedPaidSubscription(customer.state)
  const plan = paid?.plan ?? summarizeBillingState(customer.state).plan
  const credits =
    customer.state.activeMeters.find(
      (meter) => meter.meterId === POLAR_METER_ID
    )?.balance ?? 0

  if (!paid) {
    return {
      customer: "available",
      plan,
      subscription: noSubscription(credits),
      recentOrders,
    }
  }

  try {
    const subscription = await polar.subscriptions.get({
      id: paid.subscription.id,
    })

    if (subscription.productId !== paid.subscription.productId) {
      return {
        customer: "available",
        plan,
        subscription: unavailableSubscription(credits),
        recentOrders,
      }
    }

    return {
      customer: "available",
      plan,
      subscription: serializeSubscription(subscription, credits),
      recentOrders,
    }
  } catch {
    return {
      customer: "available",
      plan,
      subscription: unavailableSubscription(credits),
      recentOrders,
    }
  }
}
