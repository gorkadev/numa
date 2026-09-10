import Link from "next/link"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
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

import { getBillingSummary } from "@/lib/polar/plan"
import {
  POLAR_PRODUCT_FREE_ID,
  POLAR_PRODUCT_PRO_ID,
  POLAR_PRODUCT_TOPUP_ID,
} from "@/lib/polar/products"

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
 * The pricing page.
 *
 * # Why this is a server component
 *
 * The three product ids are server-only environment variables — see the note in
 * `lib/polar/products.ts` — so the checkout links can only be assembled where
 * those variables exist. Rendering here also means the current plan is known
 * before the first paint, so nobody watches a "Current plan" marker appear a
 * beat after they have already read the page and decided.
 *
 * # Why the top-up is disabled rather than hidden
 *
 * `app/checkout/route.ts` answers 409 for a top-up bought without an active Pro
 * subscription, and it does so for a business reason spelled out at length in
 * that file: never-expiring credits sold standalone quietly become a better
 * deal than the plan they are meant to top up. That rule exists on the server
 * whatever this page renders, which leaves three options and only one honest
 * one. An enabled button is a promise the server breaks after the click. Hiding
 * the card entirely conceals a product somebody might want to plan for. A
 * disabled button with one line saying why states the rule where the decision
 * is being made — and it is a statement of the rule, never the enforcement of
 * it, which lives and must keep living in the route.
 */
export default async function PricingPage() {
  const { plan } = await getBillingSummary()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
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
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="outline">Credit top-up</Badge>
            <CardTitle>
              $10 <span className="text-muted-foreground">one time</span>
            </CardTitle>
            <CardDescription>
              A refill for a heavy month, bought as often as you need it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "pro" ? (
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
                  <Link href={`/checkout?products=${POLAR_PRODUCT_TOPUP_ID}`} />
                }
              >
                Buy credits
              </Button>
            ) : (
              <Button className="w-full" variant="outline" disabled>
                Buy credits
              </Button>
            )}
          </CardContent>
          {/**
           * Its own `CardContent` rather than a paragraph tucked under the
           * button, so the card's own spacing separates them and this file adds
           * no layout of its own. `CardDescription` is already the muted single
           * line this needs to be.
           */}
          {plan !== "pro" && (
            <CardContent>
              <CardDescription>Available on Pro</CardDescription>
            </CardContent>
          )}
          <CardContent>
            <ItemGroup>
              <Feature>1000 credits, added immediately</Feature>
              <Feature>Never expires, unlike monthly credits</Feature>
              <Feature>Spent only once the month&rsquo;s credits are</Feature>
            </ItemGroup>
          </CardContent>
        </Card>
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
            and Pro plans can buy a top-up without waiting.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="rollover">
          <AccordionTrigger>Do unused credits roll over?</AccordionTrigger>
          <AccordionContent>
            Monthly credits do not. Whatever is left of your Free or Pro
            allowance expires when the month does, and a fresh allowance arrives
            in its place. Top-up credits are the exception: they never expire,
            and they are only touched once the month&rsquo;s allowance is gone.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="topup-requires-pro">
          <AccordionTrigger>Why do top-ups need a Pro plan?</AccordionTrigger>
          <AccordionContent>
            Top-up credits never expire, so on their own they would be a
            pay-as-you-go plan nobody designed — cheaper for the buyer than the
            plan and lumpier for us than the plan. They exist as a release valve
            for a heavy month on top of a subscription, which is the only shape
            in which both sides of that trade work.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="cancelling">
          <AccordionTrigger>Can I cancel whenever I want?</AccordionTrigger>
          <AccordionContent>
            Yes. A cancelled Pro plan runs to the end of the period you have
            already paid for, then drops to Free. Any top-up credits you bought
            survive that, because they were never tied to the subscription.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
