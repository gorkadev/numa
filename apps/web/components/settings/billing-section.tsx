"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"
import type { BillingDetails } from "@/lib/polar/billing-details"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"

type BillingState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; details: BillingDetails }

function planLabel(plan: BillingDetails["plan"]) {
  return plan === "max" ? "Max" : plan === "pro" ? "Pro" : "Free"
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount / 100)
  } catch {
    return null
  }
}

function formatDate(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

function formatCadence(cadence: BillingDetails["subscription"]["cadence"]) {
  if (!cadence || cadence.count < 1 || !cadence.interval) return null

  const interval = cadence.interval.replace(/_/g, " ")
  return cadence.count === 1
    ? `per ${interval}`
    : `every ${cadence.count} ${interval}s`
}

function statusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isSameOriginPath(href: string | null): href is string {
  return href !== null && href.startsWith("/") && !href.startsWith("//")
}

function isNextEvent(
  value: unknown
): value is NonNullable<BillingDetails["subscription"]["nextEvent"]> {
  if (!value || typeof value !== "object") return false

  const event = value as { type?: unknown; at?: unknown }
  return (
    (event.type === "cancellation" ||
      event.type === "product_change" ||
      event.type === "renewal") &&
    typeof event.at === "string"
  )
}

function isBillingDetails(value: unknown): value is BillingDetails {
  if (!value || typeof value !== "object") return false

  const details = value as Partial<BillingDetails>
  return (
    (details.customer === "available" ||
      details.customer === "missing" ||
      details.customer === "unavailable") &&
    (details.plan === "free" ||
      details.plan === "pro" ||
      details.plan === "max" ||
      details.plan === "none") &&
    !!details.subscription &&
    typeof details.subscription === "object" &&
    (details.subscription.availability === "available" ||
      details.subscription.availability === "none" ||
      details.subscription.availability === "unavailable") &&
    "nextEvent" in details.subscription &&
    (details.subscription.nextEvent === null ||
      isNextEvent(details.subscription.nextEvent)) &&
    !!details.recentOrders &&
    typeof details.recentOrders === "object" &&
    (details.recentOrders.availability === "available" ||
      details.recentOrders.availability === "unavailable") &&
    Array.isArray(details.recentOrders.items)
  )
}

function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-label="Loading billing details">
      <SettingsGroup title="Plan" description="Your subscription and credits.">
        {["plan", "credits", "manage"].map((row) => (
          <SettingsRow key={row}>
            <ItemContent>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-4 w-52" />
            </ItemContent>
            <ItemActions>
              <Skeleton className="h-8 w-20" />
            </ItemActions>
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup
        title="Billing history"
        description="Recent invoices and receipts."
      >
        {["first", "second"].map((row) => (
          <SettingsRow key={row}>
            <ItemContent>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-4 w-28" />
            </ItemContent>
            <ItemActions>
              <Skeleton className="h-8 w-24" />
            </ItemActions>
          </SettingsRow>
        ))}
      </SettingsGroup>
    </div>
  )
}

function UnavailableBilling({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        title="Billing unavailable"
        description="We could not load your billing details. Please try again."
      >
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Billing details are unavailable</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

function FactValue({ value }: { value: string | number | null }) {
  return <span className="text-sm text-muted-foreground">{value ?? "—"}</span>
}

export function BillingSection({ active }: { active: boolean }) {
  const [state, setState] = useState<BillingState>({ status: "loading" })
  const [requestVersion, setRequestVersion] = useState(0)
  const requestId = useRef(0)

  const retry = useCallback(
    () => setRequestVersion((version) => version + 1),
    []
  )

  useEffect(() => {
    if (!active) return

    const controller = new AbortController()
    const id = ++requestId.current
    let mounted = true

    async function load() {
      setState({ status: "loading" })

      try {
        const response = await fetch("/api/billing/details", {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!response.ok) throw new Error("Billing details request failed")

        const details: unknown = await response.json()
        if (!isBillingDetails(details))
          throw new Error("Invalid billing details")

        const ready =
          details.customer === "available" &&
          details.subscription.availability !== "unavailable"
        if (!ready) throw new Error("Billing details are unavailable")

        if (mounted && id === requestId.current) {
          setState({ status: "ready", details })
        }
      } catch {
        if (controller.signal.aborted) return

        if (mounted && id === requestId.current) {
          setState({ status: "unavailable" })
        }
      }
    }

    void load()

    return () => {
      mounted = false
      controller.abort()
    }
  }, [active, requestVersion])

  if (state.status === "loading") return <BillingSkeleton />
  if (state.status === "unavailable")
    return <UnavailableBilling onRetry={retry} />

  const { details } = state
  const { subscription } = details
  const cadence = formatCadence(subscription.cadence)
  const price =
    subscription.amount !== null && subscription.currency !== null
      ? formatCurrency(subscription.amount, subscription.currency)
      : null

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title="Plan" description="Your subscription and credits.">
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Current plan</ItemTitle>
            {subscription.status && (
              <ItemDescription>
                Status: {statusLabel(subscription.status)}
              </ItemDescription>
            )}
          </ItemContent>
          <ItemActions>
            {details.plan === "none" ? (
              <FactValue value={null} />
            ) : (
              <Badge
                variant={details.plan === "free" ? "secondary" : "default"}
              >
                {planLabel(details.plan)}
              </Badge>
            )}
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Price and cadence</ItemTitle>
            <ItemDescription>Current subscription price.</ItemDescription>
          </ItemContent>
          <ItemActions>
            <FactValue
              value={
                price && cadence ? `${price} ${cadence}` : (price ?? cadence)
              }
            />
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Credits</ItemTitle>
            <ItemDescription>
              What is left of this period&apos;s allowance.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <FactValue value={subscription.credits} />
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Current period</ItemTitle>
            <ItemDescription>
              Start and end of the current billing cycle.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <FactValue
              value={
                subscription.currentPeriod
                  ? [
                      formatDate(subscription.currentPeriod.start),
                      formatDate(subscription.currentPeriod.end),
                    ]
                      .filter((date): date is string => date !== null)
                      .join(" – ") || null
                  : null
              }
            />
          </ItemActions>
        </SettingsRow>
        {subscription.nextEvent && (
          <SettingsRow>
            <ItemContent>
              <ItemTitle>
                {subscription.nextEvent.type === "renewal"
                  ? "Next renewal"
                  : subscription.nextEvent.type === "product_change"
                    ? "Scheduled plan change"
                    : "Cancellation"}
              </ItemTitle>
              {subscription.nextEvent.type === "cancellation" && (
                <ItemDescription>
                  Your plan is scheduled to end.
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <FactValue value={formatDate(subscription.nextEvent.at)} />
            </ItemActions>
          </SettingsRow>
        )}
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Manage plan</ItemTitle>
            <ItemDescription>
              Change your plan or buy more credits.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/pricing" />}
            >
              Manage plan
            </Button>
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Billing portal</ItemTitle>
            <ItemDescription>
              Manage payment details and invoices.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/api/billing/portal" />}
            >
              Open billing portal
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Billing history"
        description="Recent invoices and receipts."
      >
        {details.recentOrders.availability === "unavailable" ? (
          <SettingsRow>
            <ItemContent>
              <ItemTitle>Billing history is unavailable</ItemTitle>
              <ItemDescription>
                Try again later for recent orders.
              </ItemDescription>
            </ItemContent>
          </SettingsRow>
        ) : details.recentOrders.items.length === 0 ? (
          <SettingsRow>
            <ItemContent>
              <ItemTitle>No billing history yet</ItemTitle>
              <ItemDescription>
                Invoices and receipts will appear here after a purchase.
              </ItemDescription>
            </ItemContent>
          </SettingsRow>
        ) : (
          details.recentOrders.items.map((order) => (
            <SettingsRow key={`${order.createdAt}-${order.description}`}>
              <ItemContent>
                <ItemTitle>{order.description}</ItemTitle>
                <ItemDescription>
                  {[formatDate(order.createdAt), statusLabel(order.status)]
                    .filter((value): value is string => value !== null)
                    .join(" · ")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <div className="flex items-center gap-2">
                  <FactValue
                    value={formatCurrency(order.amount, order.currency)}
                  />
                  {isSameOriginPath(order.invoiceHref) && (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={order.invoiceHref} />}
                    >
                      Invoice
                    </Button>
                  )}
                  {isSameOriginPath(order.receiptHref) && (
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={order.receiptHref} />}
                    >
                      Receipt
                    </Button>
                  )}
                </div>
              </ItemActions>
            </SettingsRow>
          ))
        )}
      </SettingsGroup>
    </div>
  )
}
