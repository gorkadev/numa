"use client"

import { useSyncExternalStore } from "react"

import Link from "next/link"
import { Cancel01Icon, FlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { BillingPlan } from "@/lib/polar/plan"

/**
 * Where the dismissal is remembered, and why it is remembered THERE.
 *
 * `localStorage` is a per-viewer convenience and deliberately not server state.
 * Nothing downstream reads this: it does not change what the organization is
 * entitled to, it does not travel to a teammate, and it does not need to
 * survive a new browser. Promoting it to a column would mean a write path, a
 * migration and a value two people on the same team can disagree about, all to
 * remember that somebody closed a card. The cost of getting it wrong is that
 * the nudge comes back, which is exactly what a nudge is supposed to do.
 */
const DISMISSED_KEY = "numa:upgrade-dismissed"

/**
 * The listeners `useSyncExternalStore` hands us, kept module-wide so that every
 * mounted card agrees the moment one of them is closed.
 */
const listeners = new Set<() => void>()

/**
 * The dismissal this session knows about even when the browser refuses to write
 * it down.
 *
 * Private windows and blocked site data make `setItem` throw, and a card that
 * ignores its own close button because the disk said no is worse than one that
 * forgets by tomorrow. So the write is best-effort and this flag is what
 * actually drives the render for the rest of the tab's life.
 */
let dismissedThisSession = false

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange)

  return () => {
    listeners.delete(onStoreChange)
  }
}

/**
 * Reads the flag as a stable string, never a fresh object.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders forever
 * if it gets a new one each time, so this returns the stored string or `null` —
 * both of which are stable — rather than anything constructed here.
 */
function readDismissed(): string | null {
  if (dismissedThisSession) return "1"

  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

/**
 * The server has no storage to read, so the server snapshot is "not dismissed".
 * React swaps in the real answer during hydration, which is one render rather
 * than the effect-then-flash a `useState` version would produce.
 */
function readDismissedOnServer(): string | null {
  return null
}

function dismiss() {
  dismissedThisSession = true

  try {
    window.localStorage.setItem(DISMISSED_KEY, "1")
  } catch {
    /** See `dismissedThisSession`: the card still closes, it just forgets. */
  }

  for (const listener of listeners) listener()
}

/**
 * The nudge that turns a free organization into a paying one.
 *
 * # Why it takes an href instead of building one
 *
 * `POLAR_PRODUCT_PRO_ID` is `process.env.POLAR_PRODUCT_PRO_ID` with no
 * `NEXT_PUBLIC_` prefix — see the long note in `lib/polar/products.ts` about
 * these being primary keys in somebody else's database rather than constants.
 * That prefix is what decides whether a value is inlined into the browser
 * bundle, so importing that module here would not "leak" the id, it would do
 * something quieter and worse: the value arrives as `undefined` and the button
 * points at `/checkout?products=undefined`, which fails at the far end of a
 * click the user has already made. The href is therefore assembled on the
 * server, where the variable exists, and handed down as a string.
 *
 * # Why it renders nothing rather than being conditionally mounted
 *
 * Returning `null` for every plan but `"free"` keeps the decision in one place.
 * The caller is the sidebar, which is already juggling collapse states and
 * keyboard chords; making it also know that Pro customers must not be sold Pro
 * is a rule that would then have to be repeated at the next call site.
 */
export function UpgradeCard({
  plan,
  href,
}: {
  plan: BillingPlan
  href: string
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    readDismissed,
    readDismissedOnServer
  )

  if ((plan !== "none" && plan !== "free") || dismissed) return null

  return (
    /**
     * Hidden rather than unmounted on the collapsed rail, the same way the
     * "Recents" group is: there is no room for a card at rail width, and CSS
     * gets it right during the width transition where a JS read of the sidebar
     * state would lag a frame behind.
     */
    <Card size="sm" className="group-data-[collapsible=icon]:hidden">
      <CardHeader>
        <Badge variant="secondary">
          <HugeiconsIcon icon={FlashIcon} />
          Pro
        </Badge>
        {/**
         * `CardAction` is the header's own slot for this — it spans both header
         * rows and pins itself to the top right, so the dismiss control needs
         * no positioning of its own and cannot drift when the copy changes.
         */}
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </CardAction>
        <CardTitle>Upgrade to Pro</CardTitle>
        <CardDescription>
          2000 credits every month, twenty times the free plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        $20 <span className="text-muted-foreground">/month</span>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          /**
           * The CTA is a link, not a button. `ButtonPrimitive` assumes a native
           * `<button>` unless told otherwise, so a `render` handing it an
           * anchor has to say so — see `packages/ui`'s `pagination.tsx` for the
           * same handoff.
           */
          nativeButton={false}
          render={<Link href={href} />}
        >
          Upgrade
        </Button>
      </CardFooter>
    </Card>
  )
}
