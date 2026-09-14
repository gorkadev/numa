"use client"

import Link from "next/link"
import { Coins01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import type { BillingSummary } from "@/lib/polar/plan"

/**
 * The credit row at the foot of the sidebar.
 *
 * It used to be markup inlined in `app-sidebar.tsx` showing a hardcoded
 * `$1.00`, which is the kind of placeholder that survives to production because
 * it looks like a real number. Pulling it out is what let it become a link to
 * the pricing page and carry the real balance, without growing the sidebar file
 * by another twenty lines of conditionals.
 *
 * # Why the styling arrives as a prop
 *
 * `className` is the rail's `MENU_ICON` string, passed down rather than
 * duplicated here. That constant is the sidebar's answer to a problem the
 * sidebar owns — icons that read as a smudge at rail width — and it applies to
 * every button in the rail. Copying it into this file would mean the day
 * somebody retunes the rail, this one button silently stops matching the three
 * above it.
 *
 * # Why a balance of `null` is a dash
 *
 * `null` means Polar was not successfully asked, not that the answer was zero.
 * See `lib/polar/plan.ts`. Rendering it as `0` would tell somebody who is
 * paying that they have run out, and a credit count is exactly the sort of
 * number people trust on sight. The dash is deliberately unremarkable: it reads
 * as "not right now" rather than as an error the reader has to act on, which is
 * the correct amount of alarm for a number that will be back on the next
 * render.
 */
export function CreditsButton({
  plan,
  balance,
  className,
}: BillingSummary & { className?: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={className}
        tooltip="Credits"
        /**
         * The same `render` handoff "New game" uses: the row IS the link, so
         * the whole hit area navigates and the browser gets a real anchor it
         * can middle-click, copy and prefetch.
         */
        render={<Link href="/pricing" />}
      >
        <HugeiconsIcon icon={Coins01Icon} />
        <span>Credits</span>
        {/**
         * Nothing at all for `"none"`, because that case means the plan is
         * unknown — an organization that has not been provisioned yet, or a
         * Polar that did not answer. A badge reading "Free" would be a guess,
         * and it would be wrong in the one direction that annoys people.
         */}
        {plan !== "none" && (
          <Badge variant={plan === "pro" ? "default" : "secondary"}>
            {plan === "pro" ? "Pro" : "Free"}
          </Badge>
        )}
      </SidebarMenuButton>
      {/**
       * A sibling rather than a child, and absolutely positioned by the
       * primitive: the row is a link, so anything inside it becomes part of the
       * link text. `SidebarMenuBadge` also hides itself on the collapsed rail,
       * which is why there is no visibility class here.
       */}
      <SidebarMenuBadge>{balance === null ? "—" : balance}</SidebarMenuBadge>
    </SidebarMenuItem>
  )
}
