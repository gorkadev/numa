"use client"

import { useState, useTransition } from "react"

import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import {
  ComputerIcon,
  Delete02Icon,
  LayoutTemplateIcon,
  MessageCircleIcon,
  Moon02Icon,
  PaintBoardIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Sun03Icon,
  Tag01Icon,
  Tick02Icon,
  TranslateIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

import { GameActionDialogs } from "@/components/game-action-dialogs"
import {
  useGameUnread,
  useGameWorking,
} from "@/components/game-activity-provider"
import { LOCALE_OPTIONS, useChangeLocale } from "@/components/locale-switcher"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"
import { setGamePinned } from "@/lib/games/actions"
import { openGameIdOf } from "@/lib/games/activity"
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from "@/lib/games/templates/catalog"
import { backFrom, type PalettePage } from "@/lib/command-palette/pages"
import { SECTION_LABEL_KEYS, SECTIONS } from "@/lib/settings/sections"

const THEMES = [
  { value: "light", label: "lightTheme", icon: Sun03Icon },
  { value: "dark", label: "darkTheme", icon: Moon02Icon },
  { value: "system", label: "systemTheme", icon: ComputerIcon },
] as const

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
  const composer = useTranslations("GameComposer")
  const { openSettings } = useSettingsDialog()
  const { theme, setTheme } = useTheme()
  const locale = useLocale()
  const { changeLocale } = useChangeLocale()

  /**
   * Nested pages are a stack over one list rather than separate dialogs, so
   * Backspace and Escape behave the same at any depth and the search box never
   * moves. The search is controlled because entering a page has to clear it:
   * the text that found "Theme" would otherwise filter the themes out.
   */
  const [pages, setPages] = useState<PalettePage[]>([])
  const [search, setSearch] = useState("")
  const page = pages.at(-1)

  function enter(next: PalettePage) {
    setPages([...pages, next])
    setSearch("")
  }

  /**
   * Reopening starts from the root, not from wherever the last visit ended.
   * Keyed on the `open` prop rather than done in a close handler, because the
   * ⌘K chord in `AppSidebar` closes the palette without passing through here.
   */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setPages([])
      setSearch("")
    }
  }
  const setOpen = onOpenChange

  /** The game on screen, which the palette can act on without the reader finding its row first. */
  const openGameId = openGameIdOf(usePathname())
  const currentGame = games.find((game) => game.id === openGameId)

  /** Same split as the sidebar: `listGames` already sorts pinned first. */
  const pinnedGames = games.filter((game) => game.pinnedAt !== null)
  const recentGames = games.filter((game) => game.pinnedAt === null)

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [, startPinning] = useTransition()

  /**
   * Close first, then navigate. The other order leaves the dialog mounted
   * across the route change, so its exit animation competes with the incoming
   * page for the same frame.
   */
  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  /** Close first, for the same reason, and because a dialog over an open palette fights it for focus. */
  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("commandPalette")}
        description={t("commandPaletteDescription")}
      >
        <CommandInput
          placeholder={
            page === "templates"
              ? t("newGameFromTemplate")
              : page
                ? settings(page)
                : t("searchGamesAndActions")
          }
          value={search}
          onValueChange={setSearch}
          onKeyDown={(event) => {
            if (event.key !== "Backspace") return
            const previous = backFrom(pages, search)
            if (previous) {
              event.preventDefault()
              setPages(previous)
            }
          }}
        />
        <CommandList>
          <CommandEmpty>{t("noResults")}</CommandEmpty>
          {page === "theme" && (
            <CommandGroup heading={settings("theme")}>
              {THEMES.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => run(() => setTheme(option.value))}
                >
                  <HugeiconsIcon icon={option.icon} strokeWidth={2} />
                  {settings(option.label)}
                  {theme === option.value && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="ml-auto"
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {page === "language" && (
            <CommandGroup heading={settings("language")}>
              {LOCALE_OPTIONS.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => run(() => changeLocale(option.value))}
                >
                  {option.label}
                  {locale === option.value && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="ml-auto"
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {page === "templates" && (
            <CommandGroup heading={t("newGameFromTemplate")}>
              {/* "No template" is plain "New game", already one level up. */}
              {TEMPLATES.filter(
                (template) => template.id !== DEFAULT_TEMPLATE_ID
              ).map((template) => (
                <CommandItem
                  key={template.id}
                  onSelect={() => go(`/?template=${template.id}`)}
                >
                  <HugeiconsIcon icon={LayoutTemplateIcon} strokeWidth={2} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">
                      {composer(`templates.${template.id}.label`)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {composer(`templates.${template.id}.tagline`)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!page && currentGame && (
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
          {!page && (
            <>
              <CommandGroup heading={t("actions")}>
                <CommandItem value={t("newGame")} onSelect={() => go("/")}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  {t("newGame")}
                </CommandItem>
                <CommandItem onSelect={() => enter("templates")}>
                  <HugeiconsIcon icon={LayoutTemplateIcon} strokeWidth={2} />
                  {t("newGameFromTemplate")}
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
                <CommandItem onSelect={() => enter("theme")}>
                  <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={2} />
                  {settings("theme")}
                </CommandItem>
                <CommandItem onSelect={() => enter("language")}>
                  <HugeiconsIcon icon={TranslateIcon} strokeWidth={2} />
                  {settings("language")}
                </CommandItem>
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
              {pinnedGames.length > 0 && (
                <CommandGroup heading={t("pinned")}>
                  {pinnedGames.map((game) => (
                    <GameItem key={game.id} game={game} onSelect={go} />
                  ))}
                </CommandGroup>
              )}
              {recentGames.length > 0 && (
                <CommandGroup heading={t("recents")}>
                  {recentGames.map((game) => (
                    <GameItem key={game.id} game={game} onSelect={go} />
                  ))}
                </CommandGroup>
              )}
            </>
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

/**
 * One game in the palette, wearing the sidebar row's live state: a spinner
 * while its agent works, the unread dot once it finished. Its own component so
 * each row subscribes to only its own game and re-renders alone.
 */
function GameItem({
  game,
  onSelect,
}: {
  game: Game
  onSelect: (href: string) => void
}) {
  const t = useTranslations("GameMenu")
  const working = useGameWorking(game.id)
  const unread = useGameUnread(game.id)

  return (
    <CommandItem
      /**
       * cmdk filters on `value`, and the default value is the item's text
       * content — which here is the title plus whatever the icon contributes.
       * Spelling it out keeps the match on the title alone, and the id keeps
       * two games of the same name distinct.
       */
      value={`${game.title} ${game.id}`}
      onSelect={() => onSelect(`/games/${game.id}`)}
    >
      <HugeiconsIcon icon={MessageCircleIcon} strokeWidth={2} />
      <span className="truncate">{game.title}</span>
      {working ? (
        <Spinner label={t("working")} className="ml-auto" />
      ) : unread ? (
        <span
          role="status"
          aria-label={t("unread")}
          className="ml-auto size-2 shrink-0 rounded-full bg-primary"
        />
      ) : null}
    </CommandItem>
  )
}
