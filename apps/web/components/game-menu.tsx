"use client"

import { useState, useTransition } from "react"

import { useTranslations } from "next-intl"

import {
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { GameActionDialogs } from "@/components/game-action-dialogs"
import { setGamePinned } from "@/lib/games/actions"

/**
 * The game's own actions, as an overflow menu.
 *
 * Rename and delete confirm in `GameActionDialogs`, rendered as a sibling of
 * the menu rather than inside its items: a menu item unmounts with the menu the
 * moment it is clicked, taking any dialog rendered inside it along.
 */
export function GameMenu({
  gameId,
  title,
  pinned = false,
  trigger,
}: {
  gameId: string
  title: string
  /** Whether this game is currently pinned — decides which of the two the menu offers, and which icon it wears. */
  pinned?: boolean
  /**
   * Replaces the control that opens the menu, for a caller whose layout owns
   * what it should look like — the sidebar's rows position theirs themselves.
   * Left out, it is the icon button the game page's header wants.
   */
  trigger?: React.ComponentProps<typeof DropdownMenuTrigger>["render"]
}) {
  const t = useTranslations("GameMenu")

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  /**
   * No dialog and no error state: pinning is instant, reversible from the
   * same menu, and low-stakes enough that a failure — the game was deleted
   * out from under this row, say — is just a toggle that silently did not
   * take. The transition alone is enough to stop a second click from firing
   * while the first is still in flight.
   */
  const [pinning, startPinning] = useTransition()

  function togglePinned() {
    startPinning(async () => {
      await setGamePinned(gameId, !pinned)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={trigger ?? <Button variant="ghost" size="icon-sm" />}
          aria-label={t("menuLabel")}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onClick={togglePinned} disabled={pinning}>
            <HugeiconsIcon icon={pinned ? PinOffIcon : PinIcon} strokeWidth={2} />
            {pinned ? t("unpin") : t("pin")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GameActionDialogs
        gameId={gameId}
        title={title}
        renameOpen={renameOpen}
        onRenameOpenChange={setRenameOpen}
        deleteOpen={deleteOpen}
        onDeleteOpenChange={setDeleteOpen}
      />
    </>
  )
}
