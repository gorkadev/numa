"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Game } from "@workspace/db/schema"
import { MarqueeText } from "@workspace/ui/components/marquee-text"
import { PopoverClose } from "@workspace/ui/components/popover"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { GameMenu } from "@/components/game-menu"

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
  game: Game
  closeOnSelect?: boolean
}) {
  const pathname = usePathname()

  const row = (
    <SidebarMenuButton
      isActive={pathname === `/games/${game.id}`}
      render={<Link href={`/games/${game.id}`} />}
    >
      <MarqueeText>{game.title}</MarqueeText>
    </SidebarMenuButton>
  )

  /**
   * `data-marquee-group` gives the title the whole row as its hover target,
   * rather than only the few pixels the text itself covers.
   */
  return (
    <SidebarMenuItem data-marquee-group>
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
      <GameMenu
        gameId={game.id}
        title={game.title}
        trigger={<SidebarMenuAction showOnHover />}
      />
    </SidebarMenuItem>
  )
}
