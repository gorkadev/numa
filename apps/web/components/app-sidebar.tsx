"use client"

import { useEffect, useState, useTransition } from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  LibraryIcon,
  ListFilterIcon,
  MessageCircleIcon,
  PencilEdit02Icon,
  SearchIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  parseGamesSort,
  type GameListItem,
  type GamesPage,
  type GamesSort,
} from "@/lib/games/game-list"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Empty, EmptyDescription } from "@workspace/ui/components/empty"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { CreditsButton } from "@/components/credits-button"
import { useSeedGameTitles, useSeedUnreadGames } from "@/components/game-activity-provider"
import { GameRow } from "@/components/game-row"
import { LoadMoreSentinel } from "@/components/load-more-sentinel"
import { Spinner } from "@/components/localized-spinner"
import { useSidebarGames } from "@/components/use-sidebar-games"
import { NavUser } from "@/components/nav-user"
import { UpgradeCard } from "@/components/upgrade-card"
import { useIsMac } from "@/hooks/use-is-mac"
import { useRowFlip } from "@/hooks/use-row-flip"
import { setGamesSort } from "@/lib/games/actions"
import { useLiveBilling } from "@/hooks/use-live-billing"
import { isGameUnread } from "@/lib/games/activity"
import type { BillingSummary } from "@/lib/polar/plan"

type CommandPaletteComponent =
  typeof import("@/components/command-palette").CommandPalette

/**
 * `cmdk` and its dialog stack, loaded once the page is idle (or on the first
 * ⌘K, if that comes sooner) rather than with every app route's first load.
 *
 * The palette is always mounted closed before it opens: a Radix dialog that
 * mounts already open does not move focus into the search box.
 */
function useCommandPalette(open: boolean) {
  const [Palette, setPalette] = useState<CommandPaletteComponent | null>(null)
  const [mountedClosed, setMountedClosed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      void import("@/components/command-palette").then((m) => {
        if (!cancelled) setPalette(() => m.CommandPalette)
      })

    if (open) {
      load()
      return () => {
        cancelled = true
      }
    }

    /** Safari has no `requestIdleCallback`. */
    const idle = typeof window.requestIdleCallback === "function"
    const id = idle
      ? window.requestIdleCallback(load)
      : window.setTimeout(load, 1)
    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [open])

  useEffect(() => {
    // Opening has to wait for the commit that mounted the palette closed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Palette) setMountedClosed(true)
  }, [Palette])

  return { Palette, canOpen: mountedClosed }
}

/**
 * What every rail button wears.
 *
 * `SidebarMenuButton` ships `[&_svg]:size-4`, which reads as a smudge at rail
 * width — so the icons are 20px in both states, and only the collapsed padding
 * is trimmed to 6px to make room for them. The button itself cannot grow,
 * because `SidebarGroup`'s own padding is what bounds it.
 */
const MENU_ICON = "[&_svg]:size-5 group-data-[collapsible=icon]:p-1.5!"

/**
 * The chords the sidebar owns, spelled once so each handler and the hint in its
 * tooltip can never drift apart.
 */
const NEW_GAME_KEY = "o"
const SEARCH_KEY = "k"

export function AppSidebar({
  pinned,
  recents,
  sort,
  billing: initialBilling,
  upgradeHref,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  /** Every pinned game. */
  pinned: GameListItem[]
  /** The first page of the unpinned games; the rest load as the list scrolls. */
  recents: GamesPage
  /** The order the layout read the first page in, from the sort cookie. */
  sort: GamesSort
  billing: BillingSummary
  /**
   * The checkout URL for the Pro product, built by the layout.
   *
   * It arrives as a prop because this file is a client component and the
   * product id lives in a variable with no `NEXT_PUBLIC_` prefix — see
   * `components/upgrade-card.tsx` for what reading it here would actually do,
   * which is quietly produce a link to `products=undefined` rather than fail.
   */
  upgradeHref: string
}) {
  /**
   * The prop is where the number STARTS, not where it stays.
   *
   * The layout renders above every page, so it never re-runs while a game is
   * being built inside it — a credit count taken from the prop alone is
   * accurate at first paint and stale for the rest of the session. The hook
   * keeps it moving; see `hooks/use-live-billing.ts` for the three things it
   * listens to and why the optimistic subtraction is safe.
   */
  const billing = useLiveBilling(initialBilling)

  const {
    games,
    pinned: pinnedGames,
    recents: recentGames,
    hasMore,
    loadingMore,
    loadMoreFailed,
    loadMore,
  } = useSidebarGames({ pinned, recents, sort })

  /** The unread dots at load, from the rows already here; live changes come from the run subscription. */
  useSeedUnreadGames(games.filter(isGameUnread).map((game) => game.id))
  useSeedGameTitles(games)
  useRowFlip(games)

  /**
   * Counts sort switches, so the list remounts (and fades in) on each one
   * but not on first paint, where a fade would only delay the sidebar.
   */
  const [shownSort, setShownSort] = useState(sort)
  const [sortSwitches, setSortSwitches] = useState(0)
  if (sort !== shownSort) {
    setShownSort(sort)
    setSortSwitches((count) => count + 1)
  }


  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations("Shell")

  /** The end of a list of games: the next page loads as it nears view. */
  const listEnd = (
    <>
      <LoadMoreSentinel
        onReach={loadMore}
        enabled={hasMore && !loadingMore && !loadMoreFailed}
      />
      {loadingMore ? (
        <div className="flex justify-center py-2">
          <Spinner className="size-4 text-muted-foreground" />
        </div>
      ) : loadMoreFailed ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={loadMore}
        >
          {t("retryLoadingGames")}
        </Button>
      ) : null}
    </>
  )
  const isMac = useIsMac()
  const { state, setOpenMobile } = useSidebar()
  const [searchOpen, setSearchOpen] = useState(false)
  const { Palette, canOpen } = useCommandPalette(searchOpen)

  const newGameHint = isMac ? "⌘⇧O" : "Ctrl ⇧ O"
  const searchHint = isMac ? "⌘K" : "Ctrl K"
  /** Bound by `SidebarProvider`, so this hint only mirrors it. */
  const toggleHint = isMac ? "⌘B" : "Ctrl B"

  /**
   * The shortcuts live on the window rather than on the controls they mirror,
   * because a control only hears a key when it already has focus and the whole
   * point of a chord is reaching the thing from anywhere — including from
   * inside the composer.
   *
   * New game asks for Shift alongside the platform modifier so it cannot be
   * mistaken for the browser's own ⌘O, and `event.code` rather than `event.key`
   * is what gets compared: with Shift held, `key` on some layouts is already
   * the shifted character, while `code` names the physical key regardless.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      if (event.code === `Key${NEW_GAME_KEY.toUpperCase()}` && event.shiftKey) {
        event.preventDefault()
        router.push("/")
        return
      }

      if (event.code === `Key${SEARCH_KEY.toUpperCase()}` && !event.shiftKey) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router])

  return (
    <>
      {Palette && (
        <Palette
          games={games}
          open={searchOpen && canOpen}
          onOpenChange={setSearchOpen}
        />
      )}
      <Sidebar collapsible="icon" variant="floating" {...props}>
        <SidebarHeader className="flex-row items-center justify-between group-data-[collapsible=icon]:justify-center">
          <Link
            href="/"
            className="flex items-center gap-2 group-data-[collapsible=icon]:hidden"
          >
            <Image
              src="/logo.svg"
              alt="Numa"
              width={20}
              height={20}
              className="size-5"
            />
            <span className="text-base font-medium">Numa</span>
          </Link>
          {/**
           * `!` rather than a plain size on both: `Button` sizes its icons
           * through `[&_svg:not([class*='size-'])]`, a more specific selector
           * than anything a class on the button can express, so importance is
           * the only way over it.
           *
           * Search hides once collapsed, where it reappears in the rail menu
           * below — the header has no room for two icons at that width.
           */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("search")}
                    onClick={() => setSearchOpen(true)}
                    className="group-data-[collapsible=icon]:hidden [&_svg]:size-5!"
                  />
                }
              >
                <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>
                <span className="text-[13px] font-medium">{t("search")}</span>
                <Kbd>{searchHint}</Kbd>
              </TooltipContent>
            </Tooltip>
            {/**
             * The toggle carries a chord too — `SidebarProvider` binds it, not
             * this file — and an unannounced shortcut is one nobody uses.
             */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarTrigger
                    aria-label={t("toggleSidebar")}
                    className="[&_svg]:size-5!"
                  />
                }
              />
              <TooltipContent
                sideOffset={state === "expanded" ? 10 : 25}
                side={state === "expanded" ? "bottom" : "right"}
              >
                <span className="text-[13px] font-medium">
                  {t("toggleSidebar")}
                </span>
                <Kbd>{toggleHint}</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              {/**
               * "New game", the collapsed search opener and the collapsed
               * "Recents" opener share one menu on purpose. They used to sit in
               * separate `SidebarGroup`s, and a group carries its own padding —
               * so once collapsed the rail showed icons pushed apart by a gap
               * that meant nothing, since the label justifying the split is
               * hidden at that width anyway.
               */}
              <SidebarMenu className="gap-2">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={MENU_ICON}
                    isActive={pathname === "/"}
                    /**
                     * An object rather than a string because the hint carries
                     * the chord as well as the name. `SidebarMenuButton`
                     * already hides the whole thing while the sidebar is
                     * expanded, where the label is right there on the row.
                     */
                    tooltip={{
                      children: (
                        <>
                          <span className="text-[13px] font-medium">
                            {t("newGame")}
                          </span>
                          <Kbd>{newGameHint}</Kbd>
                        </>
                      ),
                      sideOffset: 25,
                    }}
                    /**
                     * On a phone-width screen the sidebar is an off-canvas
                     * drawer (`sidebar.tsx`'s `isMobile` branch): navigating
                     * away is the reader's signal they are done with it, so
                     * this closes it the same way `GameRow`'s own link does.
                     * A no-op on desktop, where `openMobile` is never read.
                     */
                    onClick={() => setOpenMobile(false)}
                    render={<Link href="/" />}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} />
                    <span>{t("newGame")}</span>
                    {/** The expanded row's own hint; collapsed, the tooltip above carries it. */}
                    <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
                      {newGameHint}
                    </Kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={MENU_ICON}
                    isActive={pathname === "/library"}
                    tooltip={{
                      children: (
                        <span className="text-[13px] font-medium">
                          {t("library")}
                        </span>
                      ),
                      sideOffset: 25,
                    }}
                    onClick={() => setOpenMobile(false)}
                    render={<Link href="/library" />}
                  >
                    <HugeiconsIcon icon={LibraryIcon} />
                    <span>{t("library")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
                  <SidebarMenuButton
                    className={MENU_ICON}
                    onClick={() => setSearchOpen(true)}
                    tooltip={{
                      children: (
                        <>
                          <span className="text-[13px] font-medium">
                            {t("search")}
                          </span>
                          <Kbd>{searchHint}</Kbd>
                        </>
                      ),
                      sideOffset: 25,
                    }}
                  >
                    <HugeiconsIcon icon={SearchIcon} />
                    <span>{t("search")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
                  <Popover>
                    <PopoverTrigger
                      render={
                        <SidebarMenuButton
                          className={MENU_ICON}
                          tooltip={{
                            children: (
                              <span className="text-[13px] font-medium">
                                {t("recents")}
                              </span>
                            ),
                            sideOffset: 25,
                          }}
                        >
                          <HugeiconsIcon icon={MessageCircleIcon} />
                          <span>{t("recents")}</span>
                        </SidebarMenuButton>
                      }
                    />
                    {/**
                     * Capped at 28rem, or less when the viewport has less room
                     * below the trigger (`--available-height` from the
                     * positioner), so a long history scrolls inside the
                     * popover instead of stretching it past the screen.
                     */}
                    <PopoverContent
                      side="right"
                      align="start"
                      className="max-h-[min(28rem,var(--available-height))] gap-1.5 p-2"
                    >
                      <PopoverHeader className="px-2 pt-1">
                        <PopoverTitle className="text-xs text-muted-foreground">
                          {t("recents")}
                        </PopoverTitle>
                      </PopoverHeader>
                      {games.length === 0 ? (
                        <Empty className="p-3">
                          <EmptyDescription className="text-xs">
                            {t("emptyGames")}
                          </EmptyDescription>
                        </Empty>
                      ) : (
                        <div className="no-scrollbar min-h-0 scroll-fade overflow-x-hidden overflow-y-auto overscroll-contain">
                          <SidebarMenu>
                            {games.map((game) => (
                              <GameRow key={game.id} game={game} closeOnSelect />
                            ))}
                          </SidebarMenu>
                          {listEnd}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {/**
           * Hidden wholesale when collapsed, rather than hiding each thing
           * inside it: an empty group still contributes its padding, which is
           * the other half of the gap the rail used to show.
           */}
          {/**
           * Its own group, above "Recents" and outside the scroller below —
           * pinning is meant for the handful of games worth always seeing
           * without scrolling, not a second long list. Left out entirely
           * when nothing is pinned, rather than an empty group with only a
           * label: an org that has never pinned anything should not see a
           * heading for a feature it has not used yet.
           */}
          {pinnedGames.length > 0 ? (
            <SidebarGroup className="pb-0 group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>{t("pinned")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pinnedGames.map((game) => (
                    <GameRow key={game.id} game={game} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
          {/**
           * The list scrolls on its own, below a label that stays put, rather
           * than the whole `SidebarContent` scrolling "New game" and "Recents"
           * away with it: `min-h-0 flex-1` lets the group take the leftover
           * height and shrink below its content, and the list inside is the
           * scroller. `scroll-fade` needs exactly that — it masks the element
           * that carries the overflow, fading an edge only while there is more
           * to scroll towards it.
           *
           * `overflow-x-hidden` is spelled out because `overflow-y: auto` on
           * its own turns the other axis to `auto` as well, and a row a few
           * pixels wider than the list (the mobile drawer measures 274 in 270)
           * was enough to make it scroll sideways.
           *
           * Only `recentGames` here — a pinned game already has its row above
           * and does not repeat below it.
           */}
          <SidebarGroup className="min-h-0 flex-1 pb-0 group-data-[collapsible=icon]:hidden">
            {/**
             * The label's own row is the hover target, so the sort button only
             * shows up when the pointer is on "Recents", not anywhere in the
             * list below it.
             */}
            <div className="group/recents relative">
              <SidebarGroupLabel>{t("recents")}</SidebarGroupLabel>
              <GamesSortMenu sort={sort} />
            </div>
            <SidebarGroupContent className="no-scrollbar min-h-0 flex-1 scroll-fade overflow-x-hidden overflow-y-auto overscroll-contain pb-2">
              {games.length === 0 ? (
                <Empty className="border p-3">
                  <EmptyDescription className="text-xs">
                    {t("emptyGames")}
                  </EmptyDescription>
                </Empty>
              ) : (
                <>
                  {/**
                   * A new order is a whole new list, so it fades in rather
                   * than every row sliding across: 150 ms from transparent,
                   * through `@starting-style`, only after a switch.
                   */}
                  <SidebarMenu
                    key={sortSwitches}
                    className={
                      sortSwitches > 0
                        ? "transition-opacity duration-150 ease-out starting:opacity-0"
                        : undefined
                    }
                  >
                    {recentGames.map((game) => (
                      <GameRow key={game.id} game={game} />
                    ))}
                  </SidebarMenu>
                  {listEnd}
                </>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UpgradeCard plan={billing.plan} href={upgradeHref} />
          <SidebarMenu>
            <CreditsButton {...billing} className={MENU_ICON} />
          </SidebarMenu>
          <NavUser plan={billing.plan} />
        </SidebarFooter>
      </Sidebar>
    </>
  )
}

/**
 * The order of the "Recents" list, beside its label: the last message sent
 * (the default) or when each game was created. The choice is saved by a
 * server action that sets the cookie and re-renders the shell, so the radio
 * shows the pending choice at once while the new first page is on its way.
 */
function GamesSortMenu({ sort }: { sort: GamesSort }) {
  const t = useTranslations("Shell")
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState(sort)
  const value = pending ? chosen : sort

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <SidebarGroupAction
                  aria-label={t("sortGames")}
                  /**
                   * Sized to the `text-xs` label beside it, and hidden until
                   * that row is hovered from `md` up; keyboard focus and an
                   * open menu keep it visible. Touch screens have no hover, so
                   * below `md` it always shows.
                   */
                  className="top-1.5 right-1.5 text-sidebar-foreground/70 transition-opacity md:opacity-0 md:group-hover/recents:opacity-100 md:focus-visible:opacity-100 md:data-popup-open:opacity-100 [&>svg]:size-3.5"
                >
                  <HugeiconsIcon icon={ListFilterIcon} strokeWidth={2} />
                </SidebarGroupAction>
              }
            />
          }
        />
        <TooltipContent side="right">{t("sortGames")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("sortGames")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => {
              const parsed = parseGamesSort(String(next))
              if (parsed === value) return
              setChosen(parsed)
              startTransition(() => setGamesSort(parsed))
            }}
          >
            <DropdownMenuRadioItem value="activity" closeOnClick>
              {t("sortByActivity")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="created" closeOnClick>
              {t("sortByCreated")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
