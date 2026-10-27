"use client"

import { useEffect, useState, useTransition } from "react"

import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import {
  ArrowDown02Icon,
  ArrowUp02Icon,
  CornerDownLeftIcon,
  Delete02Icon,
  LayoutTemplateIcon,
  MessageCircleIcon,
  PaintBoardIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  SparklesIcon,
  Tag01Icon,
  ToggleOffIcon,
  ToggleOnIcon,
  TranslateIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import { Spinner } from "@workspace/ui/components/spinner"
import { Kbd } from "@workspace/ui/components/kbd"
import { toast } from "@workspace/ui/components/toast"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  defaultFilter,
} from "@workspace/ui/components/command"

import { GameActionDialogs } from "@/components/game-action-dialogs"
import {
  useGameUnread,
  useGameWorking,
} from "@/components/game-activity-provider"
import { LOCALE_OPTIONS, useChangeLocale } from "@/components/locale-switcher"
import { useIsMac } from "@/hooks/use-is-mac"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"
import { createGame, setGamePinned } from "@/lib/games/actions"
import { MIN_MESSAGE_QUERY_LENGTH } from "@/lib/games/message-search"
import { searchGameMessages, type MessageHit } from "@/lib/games/search-actions"
import { openGameIdOf } from "@/lib/games/activity"
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from "@/lib/games/templates/catalog"
import { backFrom, type PalettePage } from "@/lib/command-palette/pages"
import {
  parseQuery,
  quickPromptOf,
} from "@/lib/command-palette/query"
import {
  formatShortcutKey,
  shortcutKeys,
  type ShortcutLabel,
} from "@/lib/settings/keyboard-shortcuts"
import {
  DEFAULT_SECTION_ID,
  SECTION_LABEL_KEYS,
  SECTIONS,
} from "@/lib/settings/sections"
import { searchSettings } from "@/lib/settings/search"
import type { GameSettings } from "@/lib/settings/game-preferences"
import {
  readGameSettings,
  updateGameSettings,
} from "@/lib/settings/game-settings"
import {
  toggleActionsFor,
  type ToggleAction,
} from "@/lib/settings/setting-actions"
import { useSearchableSettings } from "@/components/settings/use-searchable-settings"
import { newGameDraft } from "@/lib/games/new-game-draft"
import { THEMES } from "@/lib/settings/themes"


/** Enough to cover a query's real matches without burying games and actions. */
const MAX_SETTING_HITS = 5

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

  /**
   * Prefixes only mean something on the root list: inside a page every row is
   * the same kind, and a `#` there is just text.
   */
  const scope = page ? "all" : parseQuery(search).scope
  const quickPrompt = quickPromptOf(search, page)
  const messageQuery =
    !page && scope !== "commands" ? parseQuery(search).text.trim() : ""
  const messageHits = useMessageHits(messageQuery)

  /**
   * Individual settings, from the same index and ranking as the settings
   * dialog's search box, so typing "sign out" finds the row and not just the
   * section it lives in. Only on the root list and only once something is
   * typed; the section rows below still cover browsing.
   */
  const searchableSettings = useSearchableSettings()
  /**
   * Settings rows only exist when `searchSettings` found them, which also
   * matches accents and synonyms cmdk's own filter does not know. Leading
   * their cmdk value with the query itself makes cmdk keep and rank them
   * like any match, inside their normal group; `forceMount` would not, since
   * cmdk still hides a group whose rows all miss its filter.
   */
  const settingQuery = parseQuery(search).text
  const settingHits =
    !page && scope !== "games"
      ? searchSettings(searchableSettings, settingQuery).slice(
          0,
          MAX_SETTING_HITS
        )
      : []

  /**
   * The saved game settings, read each time the palette opens, so a toggle
   * row can say which way it will flip. Until they arrive no toggle is
   * offered rather than one that might point the wrong way.
   */
  const [gameSettings, setGameSettings] = useState<GameSettings | null>(null)
  useEffect(() => {
    if (!open) return
    let current = true
    readGameSettings()
      .then((value) => current && setGameSettings(value))
      .catch(() => current && setGameSettings(null))
    return () => {
      current = false
    }
  }, [open])
  const toggleActions = toggleActionsFor(
    settingHits.map((hit) => hit.id),
    gameSettings
  )

  function applyToggle(action: ToggleAction, undo = false) {
    const next = undo ? !action.next : action.next
    void updateGameSettings({ [action.key]: next } as Partial<GameSettings>)
      .then((saved) => {
        setGameSettings(saved)
        router.refresh()
        if (undo) return
        const title = settingHits.find((hit) => hit.id === action.id)?.title
        const toastId = toast.add({
          title: t(next ? "settingTurnedOn" : "settingTurnedOff", {
            setting: title ?? "",
          }),
          actionProps: {
            children: t("undo"),
            onClick: () => {
              toast.close(toastId)
              applyToggle(action, true)
            },
          },
        })
      })
      .catch(() => toast.add({ type: "error", title: t("settingNotSaved") }))
  }

  function createFromPrompt(prompt: string) {
    startCreating(async () => {
      const formData = new FormData()
      formData.set("prompt", prompt)
      const result = await createGame(null, formData)
      if (result?.error) toast.add({ type: "error", title: result.error })
    })
  }
  const showCommands = scope !== "games"
  const showGames = scope !== "commands"

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
  const pathname = usePathname()
  const openGameId = openGameIdOf(pathname)

  /**
   * The palette stays open while the game is created — naming it takes a
   * model call — so the spinner has somewhere to show, and closes when the
   * action's redirect lands on the new game.
   */
  const [creating, startCreating] = useTransition()
  useEffect(() => {
    onOpenChange(false)
  }, [pathname, onOpenChange])
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
        filter={(value, _search, keywords) =>
          defaultFilter(
            value,
            page ? search : parseQuery(search).text,
            keywords
          )
        }
        title={t("commandPalette")}
        description={t("commandPaletteDescription")}
        /**
         * Anchored by its top edge, like every palette, so it does not jump
         * as filtering shrinks the list; the edge sits half the full
         * palette's height (~29rem: input, 24rem of list, hints) above the
         * middle, so a full palette is centred exactly.
         */
        className="top-[max(1rem,calc(50svh-14.5rem))] sm:max-w-xl"
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
        {/**
         * Taller than the default list, and faded at whichever edge still has
         * rows past it — the same `scroll-fade` the sidebar's history uses.
         * On a window too short for the full palette it also stops 1rem
         * short of the bottom, matching the 1rem the top edge keeps.
         */}
        <CommandList className="max-h-[min(24rem,calc(100svh-7rem))] scroll-fade">
          {/* cmdk counts only filtered rows, so it would show beside the always-there Create row. */}
          {!quickPrompt && <CommandEmpty>{t("noResults")}</CommandEmpty>}
          {page === "theme" && (
            <CommandGroup heading={settings("theme")}>
              {THEMES.map((option) => (
                <CommandItem
                  key={option.value}
                  /** `CommandItem` draws its own tick, at the row's end, for a checked row. */
                  data-checked={theme === option.value}
                  onSelect={() => run(() => setTheme(option.value))}
                >
                  <HugeiconsIcon icon={option.icon} strokeWidth={2} />
                  {settings(option.label)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {page === "language" && (
            <CommandGroup heading={settings("language")}>
              {LOCALE_OPTIONS.map((option) => (
                <CommandItem
                  key={option.value}
                  data-checked={locale === option.value}
                  onSelect={() => run(() => changeLocale(option.value))}
                >
                  {option.label}
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
          {!page && showCommands && currentGame && (
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
              {showCommands && (
                <>
                  <CommandGroup heading={t("actions")}>
                    {toggleActions.map((action) => {
                      const hit = settingHits.find(
                        (entry) => entry.id === action.id
                      )!
                      const label = t(action.next ? "turnOn" : "turnOff", {
                        setting: hit.title,
                      })
                      return (
                        <CommandItem
                          key={`toggle-${action.id}`}
                          value={`${settingQuery} ${label}`}
                          keywords={[hit.keywords ?? "", hit.sectionLabel]}
                          onSelect={() => run(() => applyToggle(action))}
                        >
                          <HugeiconsIcon
                            icon={action.next ? ToggleOnIcon : ToggleOffIcon}
                            strokeWidth={2}
                          />
                          {label}
                        </CommandItem>
                      )
                    })}
                    <CommandItem value={t("newGame")} onSelect={() => go("/")}>
                      <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                      {t("newGame")}
                      <ShortcutHint label="newGame" />
                    </CommandItem>
                    <CommandItem onSelect={() => enter("templates")}>
                      <HugeiconsIcon
                        icon={LayoutTemplateIcon}
                        strokeWidth={2}
                      />
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
                    {settingHits.map((hit) => (
                      <CommandItem
                        key={`setting-${hit.id}`}
                        value={`${settingQuery} ${hit.title} ${hit.sectionLabel}`}
                        keywords={[hit.keywords ?? "", hit.description ?? ""]}
                        onSelect={() =>
                          run(() => openSettings(hit.section, hit.id))
                        }
                      >
                        <HugeiconsIcon
                          icon={SECTIONS.find((entry) => entry.id === hit.section)!.icon}
                          strokeWidth={2}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {hit.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {hit.sectionLabel}
                        </span>
                      </CommandItem>
                    ))}
                    <CommandItem onSelect={() => enter("theme")}>
                      <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={2} />
                      {settings("theme")}
                      <ShortcutHint label="toggleTheme" />
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
                        {/* The settings chord opens the default section. */}
                        {section.id === DEFAULT_SECTION_ID && (
                          <ShortcutHint label="settings" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {showGames && pinnedGames.length > 0 && (
                <CommandGroup heading={t("pinned")}>
                  {pinnedGames.map((game) => (
                    <GameItem key={game.id} game={game} onSelect={go} />
                  ))}
                </CommandGroup>
              )}
              {showGames && recentGames.length > 0 && (
                <CommandGroup heading={t("recents")}>
                  {recentGames.map((game) => (
                    <GameItem key={game.id} game={game} onSelect={go} />
                  ))}
                </CommandGroup>
              )}
            </>
          )}
          {messageHits.length > 0 && (
            <CommandGroup heading={t("messages")}>
              {messageHits.map((hit) => (
                <CommandItem
                  key={hit.gameId}
                  /**
                   * The snippet holds the match, so the filter keeps every hit
                   * the server found; the id keeps two hits apart.
                   */
                  value={`${hit.title} ${hit.snippet} message-${hit.gameId}`}
                  onSelect={() => go(`/games/${hit.gameId}`)}
                >
                  <HugeiconsIcon icon={MessageCircleIcon} strokeWidth={2} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{hit.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {hit.snippet}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {quickPrompt && (
            /**
             * The group needs `forceMount` as well: cmdk hides a group with no
             * matching registered row, and a force-mounted row never registers.
             */
            <CommandGroup heading={t("createGame")} forceMount>
              {/**
               * Always mounted, whatever the filter says: it is the answer to
               * the search itself, so it would never match its own text.
               */}
              <CommandItem
                forceMount
                value="create-game-from-prompt"
                disabled={creating}
                onSelect={() => createFromPrompt(quickPrompt)}
              >
                {creating ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
                )}
                <span className="truncate">
                  {t("createGameFromPrompt", { prompt: quickPrompt })}
                </span>
              </CommandItem>
              <CommandItem
                forceMount
                value="open-prompt-in-composer"
                disabled={creating}
                onSelect={() => {
                  // The draft carries the text, not the URL: a long prompt
                  // would not fit there and would end up in history and logs.
                  newGameDraft.replace(quickPrompt)
                  go("/")
                }}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                <span className="truncate">{t("openInComposer")}</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
        <PaletteHints />
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
      {/**
       * In the shortcut slot: `CommandItem` reserves the row's end for its
       * (hidden) tick, and only gives it up to a `command-shortcut` child.
       */}
      {working || unread ? (
        <CommandShortcut className="flex items-center">
          {working ? (
            <Spinner label={t("working")} />
          ) : (
            <span
              role="status"
              aria-label={t("unread")}
              className="size-2 rounded-full bg-primary"
            />
          )}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  )
}

/** A row's chord from the shortcuts catalog, in the slot `CommandItem` leaves for it. */
function ShortcutHint({ label }: { label: ShortcutLabel }) {
  const isMac = useIsMac()
  return (
    <CommandShortcut>
      {shortcutKeys(label)
        .map((key) => formatShortcutKey(key, isMac))
        .join(isMac ? "" : "+")}
    </CommandShortcut>
  )
}

/** How long typing has to pause before the palette asks the server. */
const MESSAGE_SEARCH_DELAY_MS = 250

/**
 * Message hits for the search, fetched once typing pauses. A reply that
 * arrives after the query moved on is dropped, so a slow answer for "sna"
 * never overwrites the one for "snake".
 */
function useMessageHits(query: string): MessageHit[] {
  const [result, setResult] = useState<{ query: string; hits: MessageHit[] }>({
    query: "",
    hits: [],
  })

  useEffect(() => {
    if (query.length < MIN_MESSAGE_QUERY_LENGTH) return

    let current = true
    const timer = setTimeout(() => {
      searchGameMessages(query)
        .then((hits) => {
          if (current) setResult({ query, hits })
        })
        .catch(() => {
          /* The title search still works; message hits just do not show. */
        })
    }, MESSAGE_SEARCH_DELAY_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  return result.query === query ? result.hits : []
}

/**
 * The keys the palette answers to, along its bottom edge. Hidden on touch-
 * sized screens, which have no keyboard to press them with.
 *
 * The negative margins undo the `Command` root's 4px padding, so the divider
 * runs edge to edge and the row is centred in the band below it rather than
 * sitting 4px high. Arrows and Enter are icons, not `↑ ↓ ↵`: Inter draws
 * those glyphs off its line box's middle, so as text they look misaligned
 * in a key even when the box is exactly centred.
 */
function PaletteHints() {
  const t = useTranslations("Shell")

  return (
    <div className="-mx-1 -mb-1 hidden items-center gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex">
      <span className="flex items-center gap-1.5">
        <Kbd>
          <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
        </Kbd>
        <Kbd>
          <HugeiconsIcon icon={ArrowDown02Icon} strokeWidth={2} />
        </Kbd>
        {t("paletteHintNavigate")}
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>
          <HugeiconsIcon icon={CornerDownLeftIcon} strokeWidth={2} />
        </Kbd>
        {t("paletteHintSelect")}
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>&gt;</Kbd>
        {t("paletteHintActions")}
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>#</Kbd>
        {t("paletteHintGames")}
      </span>
      <span className="ms-auto flex items-center gap-1.5">
        <Kbd>Esc</Kbd>
        {t("paletteHintClose")}
      </span>
    </div>
  )
}
