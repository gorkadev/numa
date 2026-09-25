"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useFormatter, useLocale, useTranslations } from "next-intl"
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

function formatCurrency(amount: number, currency: string, locale?: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount / 100)
  } catch {
    return null
  }
}

function formatDate(value: string, locale?: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}

function statusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function knownStatusKey(status: string) {
  const keys: Record<string, string> = {
    active: "statusActive",
    canceled: "statusCanceled",
    cancelled: "statusCanceled",
    incomplete: "statusIncomplete",
    incomplete_expired: "statusIncompleteExpired",
    past_due: "statusPastDue",
    unpaid: "statusUnpaid",
    trialing: "statusTrialing",
    paused: "statusPaused",
  }
  return keys[status] ?? null
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
  const t = useTranslations("Billing")
  return (
    <div className="flex flex-col gap-8" aria-label={t("loadingDetails")}>
      <SettingsGroup title={t("planGroup")} description={t("planGroupDescription")}>
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
  const t = useTranslations("Billing")
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        title={t("unavailableTitle")}
        description={t("unavailableDescription")}
      >
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("unavailableDetails")}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
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
  const t = useTranslations("Billing")
  const format = useFormatter()
  const locale = useLocale()
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
  const cadence = subscription.cadence
  const cadenceLabel =
    cadence && cadence.count >= 1 && cadence.interval
      ? (() => {
          const interval =
            cadence.interval === "day"
              ? [t("intervalDay"), t("intervalDays")]
              : cadence.interval === "week"
                ? [t("intervalWeek"), t("intervalWeeks")]
                : cadence.interval === "month"
                  ? [t("intervalMonth"), t("intervalMonths")]
                  : cadence.interval === "year"
                    ? [t("intervalYear"), t("intervalYears")]
                    : null
          if (interval) {
            return cadence.count === 1
              ? t("cadencePer", { interval: interval[0]! })
              : t("cadenceEvery", { count: cadence.count, interval: interval[1]! })
          }
          return cadence.count === 1
            ? `per ${cadence.interval}`
            : `every ${format.number(cadence.count)} ${cadence.interval}`
        })()
      : null
  const price =
    subscription.amount !== null && subscription.currency !== null
      ? formatCurrency(subscription.amount, subscription.currency, locale)
      : null

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title={t("planGroup")} description={t("planGroupDescription")}>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("currentPlan")}</ItemTitle>
            {subscription.status && (
              <ItemDescription>
                {t("statusPrefix", { status: knownStatusKey(subscription.status) ? t(knownStatusKey(subscription.status)!) : subscription.status })}
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
                {details.plan === "free" ? t("freePlan") : details.plan === "pro" ? "Pro" : "Max"}
              </Badge>
            )}
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("priceAndCadence")}</ItemTitle>
            <ItemDescription>{t("priceAndCadenceDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <FactValue
              value={
                price && cadenceLabel ? `${price} ${cadenceLabel}` : (price ?? cadenceLabel)
              }
            />
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("credits")}</ItemTitle>
            <ItemDescription>{t("creditsDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <FactValue value={subscription.credits === null ? null : format.number(subscription.credits)} />
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("currentPeriod")}</ItemTitle>
            <ItemDescription>{t("currentPeriodDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <FactValue
              value={
                subscription.currentPeriod
                  ? [
                      formatDate(subscription.currentPeriod.start, locale),
                      formatDate(subscription.currentPeriod.end, locale),
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
                  ? t("nextRenewal")
                  : subscription.nextEvent.type === "product_change"
                    ? t("scheduledPlanChange")
                    : t("cancellation")}
              </ItemTitle>
              {subscription.nextEvent.type === "cancellation" && (
                <ItemDescription>
                  {t("planScheduledToEnd")}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions>
              <FactValue value={formatDate(subscription.nextEvent.at, locale)} />
            </ItemActions>
          </SettingsRow>
        )}
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("managePlan")}</ItemTitle>
            <ItemDescription>{t("managePlanDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/pricing" />}
            >
              {t("managePlan")}
            </Button>
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("billingPortal")}</ItemTitle>
            <ItemDescription>{t("billingPortalDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/api/billing/portal" />}
            >
              {t("openBillingPortal")}
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
