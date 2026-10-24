"use client"

import { useState, useTransition } from "react"

import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  Delete02Icon,
  MessageCircleIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Tag01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

import { GameActionDialogs } from "@/components/game-action-dialogs"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"
import { setGamePinned } from "@/lib/games/actions"
import { openGameIdOf } from "@/lib/games/activity"
import { SECTION_LABEL_KEYS, SECTIONS } from "@/lib/settings/sections"

/**
 * The palette is a controlled dialog rather than one owning its own state,
 * because two different buttons open it — the header one while the sidebar is
 * expanded, the rail one while it is collapsed — and the ⌘K chord is a third
 * caller that belongs to neither. The one place all three already meet is
 * `AppSidebar`, so that is where `open` lives.
 */
export function CommandPalette({
  games,
  open,
  onOpenChange,
}: {
  games: Game[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const t = useTranslations("Shell")
  const gameMenu = useTranslations("GameMenu")
  const settings = useTranslations("Settings")
  const { openSettings } = useSettingsDialog()

  /** The game on screen, which the palette can act on without the reader finding its row first. */
  const openGameId = openGameIdOf(usePathname())
  const currentGame = games.find((game) => game.id === openGameId)

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [, startPinning] = useTransition()

  /**
   * Close first, then navigate. The other order leaves the dialog mounted
   * across the route change, so its exit animation competes with the incoming
   * page for the same frame.
   */
  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  /** Close first, for the same reason, and because a dialog over an open palette fights it for focus. */
  function run(action: () => void) {
    onOpenChange(false)
    action()
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("commandPalette")}
        description={t("commandPaletteDescription")}
      >
        <CommandInput placeholder={t("searchGamesAndActions")} />
        <CommandList>
          <CommandEmpty>{t("noResults")}</CommandEmpty>
          {currentGame && (
            <CommandGroup heading={t("currentGame")}>
              <CommandItem
                onSelect={() =>
                  run(() =>
                    startPinning(async () => {
                      await setGamePinned(
                        currentGame.id,
                        currentGame.pinnedAt === null
                      )
                    })
                  )
                }
              >
                <HugeiconsIcon
                  icon={currentGame.pinnedAt === null ? PinIcon : PinOffIcon}
                  strokeWidth={2}
                />
                {currentGame.pinnedAt === null
                  ? gameMenu("pin")
                  : gameMenu("unpin")}
              </CommandItem>
              <CommandItem onSelect={() => run(() => setRenameOpen(true))}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                {gameMenu("rename")}
              </CommandItem>
              <CommandItem onSelect={() => run(() => setDeleteOpen(true))}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                {gameMenu("delete")}
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading={t("actions")}>
            <CommandItem value={t("newGame")} onSelect={() => go("/")}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
              {t("newGame")}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t("goTo")}>
            <CommandItem onSelect={() => go("/pricing")}>
              <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
              {t("pricing")}
            </CommandItem>
            <CommandItem onSelect={() => go("/profile")}>
              <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
              {t("profile")}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t("settings")}>
            {SECTIONS.map((section) => (
              <CommandItem
                key={section.id}
                /**
                 * "Settings" rides in the value, unseen, so typing it lists
                 * every section even though each row only shows its own name.
                 */
                value={`${t("settings")} ${settings(SECTION_LABEL_KEYS[section.id])}`}
                onSelect={() => run(() => openSettings(section.id))}
              >
                <HugeiconsIcon icon={section.icon} strokeWidth={2} />
                {settings(SECTION_LABEL_KEYS[section.id])}
              </CommandItem>
            ))}
          </CommandGroup>
          {games.length > 0 && (
            <CommandGroup heading={t("recents")}>
              {games.map((game) => (
                <CommandItem
                  key={game.id}
                  /**
                   * cmdk filters on `value`, and the default value is the item's
                   * text content — which here is the title plus whatever the icon
                   * contributes. Spelling it out keeps the match on the title
                   * alone, and the id keeps two games of the same name distinct.
                   */
                  value={`${game.title} ${game.id}`}
                  onSelect={() => go(`/games/${game.id}`)}
                >
                  <HugeiconsIcon icon={MessageCircleIcon} strokeWidth={2} />
                  <span className="truncate">{game.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      {currentGame && (
        <GameActionDialogs
          gameId={currentGame.id}
          title={currentGame.title}
          renameOpen={renameOpen}
          onRenameOpenChange={setRenameOpen}
          deleteOpen={deleteOpen}
          onDeleteOpenChange={setDeleteOpen}
        />
      )}
    </>
  )
}
