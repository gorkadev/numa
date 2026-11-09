"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { GameListItem } from "@/lib/games/queries"
import { useTranslations } from "next-intl"
import { motion, useReducedMotion } from "motion/react"
import { MarqueeText } from "@workspace/ui/components/marquee-text"
import { PopoverClose } from "@workspace/ui/components/popover"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"

import { useGameUnread, useGameWorking } from "@/components/game-activity-provider"
import { GameMenu } from "@/components/game-menu"
import { useSidebarReorders } from "@/components/use-sidebar-games"

const MotionSidebarMenuItem = motion.create(SidebarMenuItem)

/**
 * The slide a row makes when a sent message moves its game to the top:
 * strong ease-in-out, since the rows move on screen rather than enter or
 * leave, and short enough not to hold up the list.
 */
const REORDER_TRANSITION = {
  duration: 0.25,
  ease: [0.77, 0, 0.175, 1],
} as const

/**
 * One game in the Recents list.
 *
 * It exists because the list is rendered twice — as rows in the sidebar while
 * it is expanded, and as rows in a popover while it is collapsed — and the two
 * had already drifted: the collapsed copy was missing the options menu, and
 * would have missed the marquee next. One component means the rail cannot fall
 * behind the sidebar again.
 */
export function GameRow({
  game,
  /**
   * Whether selecting the row should also dismiss the surrounding popover.
   *
   * A prop rather than something inferred: `PopoverClose` reads a context that
   * only exists inside a `Popover`, so it cannot be rendered unconditionally
   * and then ignored.
   */
  closeOnSelect = false,
}: {
  game: GameListItem
  closeOnSelect?: boolean
}) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const t = useTranslations("GameMenu")
  const working = useGameWorking(game.id)
  const unread = useGameUnread(game.id)
  const reorders = useSidebarReorders()
  const reduceMotion = useReducedMotion()

  const row = (
    <SidebarMenuButton
      isActive={pathname === `/games/${game.id}`}
      /**
       * Closes the off-canvas mobile drawer on navigation — a no-op on
       * desktop, where `openMobile` is never read (`app-sidebar.tsx`'s "New
       * game" button does the same for the same reason).
       */
      onClick={() => setOpenMobile(false)}
      render={<Link href={`/games/${game.id}`} />}
    >
      <MarqueeText>{game.title}</MarqueeText>
    </SidebarMenuButton>
  )

  /**
   * `data-marquee-group` gives the title the whole row as its hover target,
   * rather than only the few pixels the text itself covers.
   *
   * `layoutDependency` limits the layout animation to the reorders a sent
   * message causes (`moveSidebarGamesToTop` counts them): Motion only
   * measures the row when that count changes, so loading a page, switching
   * the sort or a refresh moves rows without sliding them.
   */
  return (
    <MotionSidebarMenuItem
      data-marquee-group
      layout={reduceMotion ? false : "position"}
      layoutDependency={reorders}
      transition={REORDER_TRANSITION}
    >
      {closeOnSelect ? (
        <PopoverClose nativeButton={false} render={row} />
      ) : (
        row
      )}
      {/**
       * A sibling of the row rather than something inside it: the row *is* a
       * link, so a button nested in it would be invalid markup and every click
       * on the menu would also navigate. `SidebarMenuAction` is the slot for
       * exactly this — absolutely positioned over the row's right edge, which
       * the row already reserves space for, revealed on hover and kept visible
       * while the menu is open.
       *
       * Being a sibling is also what lets it work inside the popover: it sits
       * outside `PopoverClose`, so opening the menu does not dismiss the list
       * out from under it.
       */}
      {/**
       * The loader while the agent works, then the unread dot once it is done:
       * both sit in the options menu's own slot, so they never share the row
       * with it — shown while the menu is hidden, giving way to it on hover,
       * on focus and while the menu is open. Only from `md` up — below it the
       * menu is always visible (there is no hover to reveal it), and anything
       * drawn over it would hide it.
       */}
      {(working || unread) && (
        <span className="pointer-events-none absolute top-1.5 right-1 hidden aspect-square w-5 items-center justify-center text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden md:flex md:group-hover/menu-item:opacity-0 md:group-focus-within/menu-item:opacity-0 md:group-has-aria-expanded/menu-item:opacity-0">
          {working ? (
            <WorkingRing label={t("working")} />
          ) : (
            <span role="status" aria-label={t("unread")} className="size-2 rounded-full bg-primary" />
          )}
        </span>
      )}
      <GameMenu
        gameId={game.id}
        title={game.title}
        pinned={game.pinnedAt !== null}
        trigger={<SidebarMenuAction showOnHover />}
      />
    </MotionSidebarMenuItem>
  )
}

/**
 * The row's "the agent is working" mark: a faint ring in the app's primary
 * blue with a brighter arc running around it, the same dot colour as the
 * unread mark it turns into. Still under reduced motion, where the ring alone
 * says the turn is in progress.
 */
function WorkingRing({ label }: { label: string }) {
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox="0 0 16 16"
      fill="none"
      className="size-3.5 animate-spin text-primary [animation-duration:900ms] motion-reduce:animate-none"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2} />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}
