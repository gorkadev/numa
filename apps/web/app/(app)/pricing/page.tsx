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
import { getBillingSummary } from "@/lib/polar/plan"
import { getUpgradePreview } from "@/lib/polar/plan-change"
import {
  POLAR_PRODUCT_FREE_ID,
  POLAR_PRODUCT_MAX_ID,
  POLAR_PRODUCT_PRO_ID,
  POLAR_PRODUCT_TOPUP_2500_ID,
  POLAR_PRODUCT_TOPUP_5000_ID,
  POLAR_PRODUCT_TOPUP_ID,
} from "@/lib/polar/products"

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
function formatEstimatedCharge(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Renders a period boundary as the short, human date the preview quotes for
 * "renewing on ___" — no year, because nobody needs to be told the current
 * billing cycle renews in the same year it is already in.
 */
function formatRenewalDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
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
  credits,
  productId,
  hasPaidPlan,
}: {
  price: string
  credits: number
  productId: string
  hasPaidPlan: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="outline">Top-up</Badge>
        <CardTitle>
          {price} <span className="text-muted-foreground">one time</span>
        </CardTitle>
        <CardDescription>
          {credits.toLocaleString()} credits, added immediately.
        </CardDescription>
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
            Buy credits
          </Button>
        ) : (
          <Button className="w-full" variant="outline" disabled>
            Buy credits
          </Button>
        )}
      </CardContent>
      {!hasPaidPlan && (
        <CardContent>
          <CardDescription>Available on Pro or Max</CardDescription>
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
 * forms below stay server-rendered for the same reason `changePlanAction`
 * itself is a Server Action rather than a client fetch — see the long note on
 * that function for why a `<form>` POST is the only safe shape for something
 * that reschedules or charges a subscription.
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
  const [{ plan }, resolvedSearchParams] = await Promise.all([
    getBillingSummary(),
    searchParams,
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
   * The Pro→Max upgrade preview costs a Polar product read, so it is only
   * ever computed for a user actually on Pro — see
   * `getUpgradePreview`'s own note on why that scoping lives inside the
   * function rather than as a check here. `null` means either "not on Pro"
   * or "the read failed"; both render nothing, per the shared contract every
   * Polar read in this application follows: a billing hiccup degrades the
   * page, it does not break it.
   */
  const upgradePreview = plan === "pro" ? await getUpgradePreview() : null

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
          <EmptyTitle>Pay for what you build</EmptyTitle>
          <EmptyDescription>
            Every plan runs on credits. One credit is one cent of what a turn
            actually costs to generate.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      {planChangeFailed && (
        <Alert variant="destructive">
          <AlertTitle>Your plan change did not go through</AlertTitle>
          <AlertDescription>
            Nothing was charged and your plan has not changed. Try again, or
            check your payment method if this keeps happening.
          </AlertDescription>
        </Alert>
      )}

      {planChanged && (
        <Alert>
          <AlertTitle>Your plan is updating</AlertTitle>
          <AlertDescription>
            New credits can take a few seconds to show up — Polar grants them
            asynchronously, just like the balance in the sidebar.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Badge variant="secondary">Free</Badge>
            <CardTitle>
              $0 <span className="text-muted-foreground">/month</span>
            </CardTitle>
            <CardDescription>
              Enough to find out whether the idea in your head plays.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "free" ? (
              <Button className="w-full" variant="outline" disabled>
                Current plan
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
                Get started
              </Button>
            )}
          </CardContent>
          <CardContent>
            <ItemGroup>
              <Feature>100 credits every month</Feature>
              <Feature>Unlimited games and revisions</Feature>
              <Feature>Play and share every game you build</Feature>
            </ItemGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge>Pro</Badge>
            <CardTitle>
              $20 <span className="text-muted-foreground">/month</span>
            </CardTitle>
            <CardDescription>
              For the weeks where one idea turns into nine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "pro" ? (
              <Button className="w-full" variant="outline" disabled>
                Current plan
              </Button>
            ) : plan === "max" ? (
              /**
               * A downgrade, not a purchase: this posts to `changePlanAction`
               * rather than linking to a checkout, because there is an
               * existing paid subscription to convert, not a new one to
               * create — see that function's own note on why. `next_period`
               * proration is `changePlanAction`'s decision, not this page's;
               * the note here only has to be honest that it is not
               * immediate.
               */
              <form action={changePlanAction.bind(null, POLAR_PRODUCT_PRO_ID)}>
                <Button className="w-full" variant="outline" type="submit">
                  Switch to Pro
                </Button>
              </form>
            ) : (
              <Button
                className="w-full"
                nativeButton={false}
                render={
                  <Link href={`/checkout?products=${POLAR_PRODUCT_PRO_ID}`} />
                }
              >
                Upgrade
              </Button>
            )}
          </CardContent>
          <CardContent>
            <ItemGroup>
              <Feature>2000 credits every month</Feature>
              <Feature>Everything on Free</Feature>
              <Feature>Top-ups when a month runs long</Feature>
            </ItemGroup>
          </CardContent>
          {plan === "max" && (
            <CardContent>
              <CardDescription>Takes effect next billing cycle</CardDescription>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <Badge>Max</Badge>
            <CardTitle>
              $50 <span className="text-muted-foreground">/month</span>
            </CardTitle>
            <CardDescription>
              For teams that build every day and never want to watch the
              balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "max" ? (
              <Button className="w-full" variant="outline" disabled>
                Current plan
              </Button>
            ) : plan === "pro" ? (
              /**
               * An upgrade, not a purchase: same reasoning as the Pro card's
               * downgrade form, mirrored. `changePlanAction` charges the
               * prorated difference immediately for this direction — see
               * that function's own note on `prorationBehavior`.
               */
              <form action={changePlanAction.bind(null, POLAR_PRODUCT_MAX_ID)}>
                <Button className="w-full" type="submit">
                  Upgrade to Max
                </Button>
              </form>
            ) : (
              <Button
                className="w-full"
                nativeButton={false}
                render={
                  <Link href={`/checkout?products=${POLAR_PRODUCT_MAX_ID}`} />
                }
              >
                Upgrade
              </Button>
            )}
          </CardContent>
          <CardContent>
            <ItemGroup>
              <Feature>5500 credits every month</Feature>
              <Feature>Everything on Pro</Feature>
              <Feature>10% more credits per dollar than Pro</Feature>
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
          {plan === "pro" && upgradePreview && (
            <CardContent>
              <CardDescription>
                You&rsquo;ll be charged about{" "}
                {formatEstimatedCharge(upgradePreview.estimatedChargeCents)}{" "}
                today and get{" "}
                {upgradePreview.netExtraUnits.toLocaleString()} extra credits
                now. Then $50/month with 5,500 credits, renewing on{" "}
                {formatRenewalDate(upgradePreview.currentPeriodEnd)}.
              </CardDescription>
            </CardContent>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Credit top-ups</h2>
          <p className="text-sm text-muted-foreground">
            A refill for a heavy month, bought as often as you need it, on top
            of Pro or Max.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <TopUpCard
            price="$10"
            credits={1000}
            productId={POLAR_PRODUCT_TOPUP_ID}
            hasPaidPlan={hasPaidPlan}
          />
          <TopUpCard
            price="$25"
            credits={2500}
            productId={POLAR_PRODUCT_TOPUP_2500_ID}
            hasPaidPlan={hasPaidPlan}
          />
          <TopUpCard
            price="$50"
            credits={5000}
            productId={POLAR_PRODUCT_TOPUP_5000_ID}
            hasPaidPlan={hasPaidPlan}
          />
        </div>
      </div>

      <Accordion className="bg-card">
        <AccordionItem value="what-is-a-credit">
          <AccordionTrigger>What is a credit?</AccordionTrigger>
          <AccordionContent>
            One credit is one US cent of what a turn costs to generate. Building
            a game is a conversation with a model, and a long conversation about
            a complicated game costs more than a short one about a simple game —
            so credits are spent by the turn rather than by the game.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="how-usage-is-measured">
          <AccordionTrigger>How is usage measured?</AccordionTrigger>
          <AccordionContent>
            Every turn reports what it actually used when it finishes, and that
            is what comes off your balance. Nothing is charged up front and
            nothing is estimated, so a turn that fails costs you nothing.
            Balances settle a few seconds behind the turn that moved them, which
            is why the number in the sidebar can lag a refresh or two.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="running-out">
          <AccordionTrigger>What happens when I run out?</AccordionTrigger>
          <AccordionContent>
            New turns stop until your balance recovers. Nothing is deleted and
            nothing is locked: every game you have already built stays yours to
            open, play and share. Free plans refill on the first of the month,
            and Pro or Max plans can buy a top-up without waiting.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="rollover">
          <AccordionTrigger>Do unused credits roll over?</AccordionTrigger>
          <AccordionContent>
            Monthly credits do not. Whatever is left of your Free, Pro or Max
            allowance expires when the month does, and a fresh allowance arrives
            in its place. Top-up credits are the exception: they never expire,
            and they are only touched once the month&rsquo;s allowance is gone.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="topup-requires-pro">
          <AccordionTrigger>Why do top-ups need a paid plan?</AccordionTrigger>
          <AccordionContent>
            Top-up credits never expire, so on their own they would be a
            pay-as-you-go plan nobody designed — cheaper for the buyer than
            either plan and lumpier for us than either plan. They exist as a
            release valve for a heavy month on top of a subscription, which is
            the only shape in which both sides of that trade work.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="switching-plans">
          <AccordionTrigger>
            What happens when I switch between Pro and Max?
          </AccordionTrigger>
          <AccordionContent>
            Moving up to Max charges the prorated difference right away and
            switches your credits immediately. Moving down to Pro takes effect
            at the start of your next billing cycle, so a month you already paid
            the Max price for keeps its Max allowance.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="cancelling">
          <AccordionTrigger>Can I cancel whenever I want?</AccordionTrigger>
          <AccordionContent>
            Yes. A cancelled Pro or Max plan runs to the end of the period you
            have already paid for, then drops to Free. Any top-up credits you
            bought survive that, because they were never tied to the
            subscription.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
