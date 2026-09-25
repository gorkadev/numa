import Link from "next/link"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import { PlanChangeDialog } from "@/components/plan-change-dialog"
import { getBillingSummary } from "@/lib/polar/plan"
import { getPlanChangePreview } from "@/lib/polar/plan-change"
import {
  POLAR_PRODUCT_FREE_ID,
  POLAR_PRODUCT_MAX_ID,
  POLAR_PRODUCT_PRO_ID,
  POLAR_PRODUCT_TOPUP_2500_ID,
  POLAR_PRODUCT_TOPUP_5000_ID,
  POLAR_PRODUCT_TOPUP_ID,
} from "@/lib/polar/products"

import { getLocale, getTranslations } from "next-intl/server"

import { changePlanAction } from "./actions"

/**
 * Renders an estimated charge, in cents, as a dollar amount for the upgrade
 * preview.
 *
 * `estimatedChargeCents` on `PlanChangeMath` is explicitly an ESTIMATE —
 * Polar's own proration logic computes the real invoice — so this always
 * shows two decimal places rather than dropping a trailing `.00`. A number
 * that looks precise to the cent should also look like the estimate it is,
 * not like a promise this page cannot actually keep.
 */
function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100)
}

function formatLocalizedMoney(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCredits(credits: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(credits)
}

function formatCadence({
  interval,
  intervalCount,
  locale,
  t,
}: {
  interval: string
  intervalCount: number
  locale: string
  t: (key: `interval${string}` | "cadencePer" | "cadenceEvery", values?: Record<string, string | number>) => string
}): string {
  const knownIntervals: Record<string, [string, string]> = {
    day: [t("intervalDay"), t("intervalDays")],
    week: [t("intervalWeek"), t("intervalWeeks")],
    month: [t("intervalMonth"), t("intervalMonths")],
    year: [t("intervalYear"), t("intervalYears")],
  }
  const units = knownIntervals[interval]
  if (!units) {
    return intervalCount === 1
      ? `per ${interval}`
      : `every ${new Intl.NumberFormat(locale).format(intervalCount)} ${interval}s`
  }

  const unit = units[intervalCount === 1 ? 0 : 1]
  return intervalCount === 1
    ? t("cadencePer", { interval: unit })
    : t("cadenceEvery", { count: new Intl.NumberFormat(locale).format(intervalCount), interval: unit })
}

function formatPlanPrice({
  amountCents,
  currency,
  cadence,
}: {
  amountCents: number
  currency: string
  cadence: { interval: string; intervalCount: number }
}, locale: string, t: (key: `interval${string}` | "cadencePer" | "cadenceEvery", values?: Record<string, string | number>) => string): string {
  return `${formatMoney(amountCents, currency, locale)} ${formatCadence({ ...cadence, locale, t })}`
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

/**
 * One line of a plan's feature list.
 *
 * `Item` rather than a `<ul>` with a bullet the hard way: the primitive already
 * owns the icon slot, the alignment and the spacing that keeps a two-line entry
 * from unbalancing the ones above it, and `ItemGroup` already tightens its own
 * gap when the items are `xs`. A hand-rolled list would reproduce all of that
 * approximately and then drift from the rest of the application the first time
 * the spacing scale moves.
 */
function Feature({ children }: { children: React.ReactNode }) {
  return (
    <Item size="xs">
      <ItemMedia variant="icon">
        <HugeiconsIcon icon={Tick02Icon} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{children}</ItemTitle>
      </ItemContent>
    </Item>
  )
}

/**
 * One top-up pack's card.
 *
 * Pulled out of the plan grid into its own small component because there are
 * now three of these — `$10`, `$25` and `$50` — differing only in price,
 * credit count and product id. Repeating the card markup three times would
 * mean the day the disabled-state copy or the gating rule changes, it has to
 * change identically in three places or the packs silently drift apart from
 * each other.
 */
function TopUpCard({
  price,
  productId,
  hasPaidPlan,
  badgeLabel,
  oneTimeLabel,
  creditDescription,
  buyLabel,
  eligibilityLabel,
}: {
  price: string
  productId: string
  hasPaidPlan: boolean
  badgeLabel: string
  oneTimeLabel: string
  creditDescription: string
  buyLabel: string
  eligibilityLabel: string
}) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="outline">{badgeLabel}</Badge>
        <CardTitle>
          {price} <span className="text-muted-foreground">{oneTimeLabel}</span>
        </CardTitle>
        <CardDescription>{creditDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasPaidPlan ? (
          <Button
            className="w-full"
            variant="outline"
            /**
             * `render` swaps the underlying element for an anchor, and
             * `ButtonPrimitive` assumes a native `<button>` unless told
             * otherwise — the same handoff `packages/ui`'s own
             * `pagination.tsx` makes. Without this the primitive warns and
             * applies button semantics to a link.
             */
            nativeButton={false}
            render={<Link href={`/checkout?products=${productId}`} />}
          >
            {buyLabel}
          </Button>
        ) : (
          <Button className="w-full" variant="outline" disabled>
            {buyLabel}
          </Button>
        )}
      </CardContent>
      {!hasPaidPlan && (
        <CardContent>
          <CardDescription>{eligibilityLabel}</CardDescription>
        </CardContent>
      )}
    </Card>
  )
}

/**
 * The pricing page.
 *
 * # Why this is a server component
 *
 * The product ids are server-only environment variables — see the note in
 * `lib/polar/products.ts` — so the checkout links can only be assembled where
 * those variables exist. Rendering here also means the current plan is known
 * before the first paint, so nobody watches a "Current plan" marker appear a
 * beat after they have already read the page and decided. The plan-change
 * controls pass their bound Server Action into a small client dialog rather
 * than using a client fetch, so the action remains the only path that can
 * reschedule or charge a subscription.
 *
 * # Why the top-up is disabled rather than hidden
 *
 * `app/checkout/route.ts` answers 409 for a top-up bought without an active
 * paid subscription, and it does so for a business reason spelled out at
 * length in that file: never-expiring credits sold standalone quietly become
 * a better deal than the plan they are meant to top up. That rule exists on
 * the server whatever this page renders, which leaves three options and only
 * one honest one. An enabled button is a promise the server breaks after the
 * click. Hiding the card entirely conceals a product somebody might want to
 * plan for. A disabled button with one line saying why states the rule where
 * the decision is being made — and it is a statement of the rule, never the
 * enforcement of it, which lives and must keep living in the route.
 *
 * # Why `searchParams` and not a client-side error state
 *
 * `changePlanAction` redirects back here with `?planChangeError=1` on
 * failure — see that function's own note on why it redirects rather than
 * throwing. Reading the flag from `searchParams` is what lets this stay a
 * Server Component: a `useActionState` version would need the form itself to
 * be a Client Component, for a failure path that, by volume, is rare.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [
    { plan },
    resolvedSearchParams,
    t,
    locale,
  ] = await Promise.all([
    getBillingSummary(),
    searchParams,
    getTranslations("Pricing"),
    getLocale(),
  ])

  const planChangeFailed = resolvedSearchParams.planChangeError === "1"

  /**
   * `changePlanAction` redirects here with `?planChanged=1` on a SUCCESSFUL
   * plan change, mirroring `planChangeError` below. The extra copy exists
   * because a Pro→Max upgrade's credit grant is asynchronous on Polar's side
   * — the sandbox observed it landing about 3 seconds after
   * `subscriptions.update` returns — so the balance this render shows can
   * still be the pre-upgrade number even though `refresh()` already forced a
   * fresh read. Saying so once, right after the click, is cheaper than a
   * customer wondering whether their payment actually went through.
   */
  const planChanged = resolvedSearchParams.planChanged === "1"

  /**
   * The paid-plan change preview costs Polar product reads, so it is only
   * computed for users actually on Pro or Max. `null` means either no paid
   * subscription or a failed Polar read; the dialog keeps its conservative
   * generic consequences rather than inventing billing facts.
   */
  const planChangePreview =
    plan === "pro" || plan === "max" ? await getPlanChangePreview() : null

  /**
   * "Paid" means either paid plan, everywhere on this page a rule used to say
   * `plan === "pro"` and actually meant "not Free and not unknown" — the
   * top-up gate below and the badge on each top-up card both used to be Pro-
   * specific text that is now equally true of Max.
   */
  const hasPaidPlan = plan === "pro" || plan === "max"

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      {/**
       * `flex-none` because `Empty` is built to fill the space it is given, and
       * here it is a heading with a page underneath it rather than the page.
       */}
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyTitle>{t("title")}</EmptyTitle>
          <EmptyDescription>{t("description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>

      {planChangeFailed && (
        <Alert variant="destructive">
          <AlertTitle>{t("changeFailedTitle")}</AlertTitle>
          <AlertDescription>{t("changeFailedDescription")}</AlertDescription>
        </Alert>
      )}

      {planChanged && (
        <Alert>
          <AlertTitle>{t("updatingTitle")}</AlertTitle>
          <AlertDescription>{t("updatingDescription")}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Badge variant="secondary">{t("free")}</Badge>
            <CardTitle>
              {formatLocalizedMoney(0, locale)} <span className="text-muted-foreground">{t("perMonth")}</span>
            </CardTitle>
            <CardDescription>{t("freeDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "free" ? (
              <Button className="w-full" variant="outline" disabled>
                {t("currentPlan")}
              </Button>
            ) : (
              <Button
                className="w-full"
                variant="outline"
                /**
                 * `render` swaps the underlying element for an anchor, and
                 * `ButtonPrimitive` assumes a native `<button>` unless told
                 * otherwise — the same handoff `packages/ui`'s own
                 * `pagination.tsx` makes. Without this the primitive warns and
                 * applies button semantics to a link.
                 */
                nativeButton={false}
                render={
                  <Link href={`/checkout?products=${POLAR_PRODUCT_FREE_ID}`} />
                }
              >
                {t("getStarted")}
              </Button>
            )}
          </CardContent>
          <CardContent>
            <ItemGroup>
              <Feature>{t("monthlyCredits", { credits: formatCredits(100, locale) })}</Feature>
              <Feature>{t("unlimitedGames")}</Feature>
              <Feature>{t("playAndShare")}</Feature>
            </ItemGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge>{t("pro")}</Badge>
            <CardTitle>
              {formatLocalizedMoney(20, locale)} <span className="text-muted-foreground">{t("perMonth")}</span>
            </CardTitle>
            <CardDescription>{t("proDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "pro" ? (
              <Button className="w-full" variant="outline" disabled>
                {t("currentPlan")}
              </Button>
            ) : plan === "max" ? (
              <PlanChangeDialog
                action={changePlanAction.bind(null, POLAR_PRODUCT_PRO_ID)}
                direction="downgrade"
                preview={
                  planChangePreview?.direction === "downgrade"
                    ? {
                        currentPlan: `${planChangePreview.currentPlan.name} — ${formatPlanPrice(planChangePreview.currentPlan, locale, t)}`,
                        targetPlan: `${planChangePreview.targetPlan.name} — ${formatPlanPrice(planChangePreview.targetPlan, locale, t)}`,
                        currentPeriodStart: formatDate(planChangePreview.currentPeriodStart, locale),
                        currentPeriodEnd: formatDate(planChangePreview.currentPeriodEnd, locale),
                        effectiveDate: formatDate(planChangePreview.effectiveAt, locale),
                        immediateConsequence: t("downgradeConsequence", {
                          endDate: formatDate(planChangePreview.currentPeriodEnd, locale),
                        }),
                      }
                    : undefined
                }
              />
            ) : (
              <Button
                className="w-full"
                nativeButton={false}
                render={
                  <Link href={`/checkout?products=${POLAR_PRODUCT_PRO_ID}`} />
                }
              >
                {t("upgrade")}
              </Button>
            )}
          </CardContent>
          <CardContent>
            <ItemGroup>
              <Feature>{t("monthlyCredits", { credits: formatCredits(2000, locale) })}</Feature>
              <Feature>{t("everythingOnFree")}</Feature>
              <Feature>{t("topUpsFeature")}</Feature>
            </ItemGroup>
          </CardContent>
          {plan === "max" && (
            <CardContent>
              <CardDescription>{t("takesEffectNextCycle")}</CardDescription>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <Badge>{t("max")}</Badge>
            <CardTitle>
              {formatLocalizedMoney(50, locale)} <span className="text-muted-foreground">{t("perMonth")}</span>
            </CardTitle>
            <CardDescription>{t("maxDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "max" ? (
              <Button className="w-full" variant="outline" disabled>
                {t("currentPlan")}
              </Button>
            ) : plan === "pro" ? (
              <PlanChangeDialog
                action={changePlanAction.bind(null, POLAR_PRODUCT_MAX_ID)}
                direction="upgrade"
                preview={
                  planChangePreview?.direction === "upgrade" &&
                  planChangePreview.immediateConsequence.type ===
                    "estimated_charge"
                    ? {
                        currentPlan: `${planChangePreview.currentPlan.name} — ${formatPlanPrice(planChangePreview.currentPlan, locale, t)}`,
                        targetPlan: `${planChangePreview.targetPlan.name} — ${formatPlanPrice(planChangePreview.targetPlan, locale, t)}`,
                        currentPeriodStart: formatDate(planChangePreview.currentPeriodStart, locale),
                        currentPeriodEnd: formatDate(planChangePreview.currentPeriodEnd, locale),
                        effectiveDate: t("immediately"),
                        renewalDate: formatDate(planChangePreview.currentPeriodEnd, locale),
                        immediateConsequence: t("estimatedProratedCharge", {
                          amount: formatMoney(planChangePreview.immediateConsequence.amountCents, planChangePreview.targetPlan.currency, locale),
                        }),
                        extraCredits: planChangePreview.extraCredits,
                      }
                    : undefined
                }
              />
            ) : (
              <Button
                className="w-full"
                nativeButton={false}
                render={
                  <Link href={`/checkout?products=${POLAR_PRODUCT_MAX_ID}`} />
                }
              >
                {t("upgrade")}
              </Button>
            )}
          </CardContent>
          <CardContent>
            <ItemGroup>
              <Feature>{t("monthlyCredits", { credits: formatCredits(5500, locale) })}</Feature>
              <Feature>{t("everythingOnPro")}</Feature>
              <Feature>{t("moreCreditsThanPro")}</Feature>
            </ItemGroup>
          </CardContent>
          {/**
           * Server-rendered text, not a modal: `upgradePreview` is `null`
           * whenever the org is not on Pro or the Polar reads it needs
           * failed, and `getUpgradePreview` in `lib/polar/plan-change.ts` is
           * what scopes those reads to Pro-plan viewers in the first place —
           * see that function's own note. The numbers here and the actual
           * clawback `changePlanAction` ingests both come from
           * `computePlanChangeMath`, so this promise and what the action
           * later honors can never disagree.
           */}
          {planChangePreview?.direction === "upgrade" &&
            planChangePreview.immediateConsequence.type ===
              "estimated_charge" && (
              <CardContent>
                <CardDescription>
                  {t("upgradeInlinePreview", {
                    amount: formatMoney(
                      planChangePreview.immediateConsequence.amountCents,
                      planChangePreview.targetPlan.currency,
                      locale
                    ),
                    credits:
                      planChangePreview.extraCredits === undefined
                        ? ""
                        : formatCredits(planChangePreview.extraCredits, locale),
                    planPrice: formatPlanPrice(planChangePreview.targetPlan, locale, t),
                    renewalDate: formatDate(planChangePreview.currentPeriodEnd, locale),
                  })}
                </CardDescription>
              </CardContent>
            )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">{t("topUpsTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("topUpsDescription")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <TopUpCard
            price={formatLocalizedMoney(10, locale)}
            productId={POLAR_PRODUCT_TOPUP_ID}
            hasPaidPlan={hasPaidPlan}
            badgeLabel={t("topUp")}
            oneTimeLabel={t("oneTime")}
            creditDescription={t("topUpCredits", { credits: formatCredits(1000, locale) })}
            buyLabel={t("buyCredits")}
            eligibilityLabel={t("topUpEligibility")}
          />
          <TopUpCard
            price={formatLocalizedMoney(25, locale)}
            productId={POLAR_PRODUCT_TOPUP_2500_ID}
            hasPaidPlan={hasPaidPlan}
            badgeLabel={t("topUp")}
            oneTimeLabel={t("oneTime")}
            creditDescription={t("topUpCredits", { credits: formatCredits(2500, locale) })}
            buyLabel={t("buyCredits")}
            eligibilityLabel={t("topUpEligibility")}
          />
          <TopUpCard
            price={formatLocalizedMoney(50, locale)}
            productId={POLAR_PRODUCT_TOPUP_5000_ID}
            hasPaidPlan={hasPaidPlan}
            badgeLabel={t("topUp")}
            oneTimeLabel={t("oneTime")}
            creditDescription={t("topUpCredits", { credits: formatCredits(5000, locale) })}
            buyLabel={t("buyCredits")}
            eligibilityLabel={t("topUpEligibility")}
          />
        </div>
      </div>

      <Accordion className="bg-card">
        <AccordionItem value="what-is-a-credit">
          <AccordionTrigger>{t("faqWhatIsCreditQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqWhatIsCreditAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="how-usage-is-measured">
          <AccordionTrigger>{t("faqUsageQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqUsageAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="running-out">
          <AccordionTrigger>{t("faqRunningOutQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqRunningOutAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="rollover">
          <AccordionTrigger>{t("faqRolloverQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqRolloverAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="topup-requires-pro">
          <AccordionTrigger>{t("faqTopUpPlanQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqTopUpPlanAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="switching-plans">
          <AccordionTrigger>{t("faqSwitchPlansQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqSwitchPlansAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="cancelling">
          <AccordionTrigger>{t("faqCancelQuestion")}</AccordionTrigger>
          <AccordionContent>{t("faqCancelAnswer")}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
