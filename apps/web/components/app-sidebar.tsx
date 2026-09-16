"use client"

import { useEffect, useState } from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  MessageCircleIcon,
  PencilEdit02Icon,
  SearchIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import { Button } from "@workspace/ui/components/button"
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

import { CommandPalette } from "@/components/command-palette"
import { CreditsButton } from "@/components/credits-button"
import { GameRow } from "@/components/game-row"
import { NavUser } from "@/components/nav-user"
import { UpgradeCard } from "@/components/upgrade-card"
import { useIsMac } from "@/hooks/use-is-mac"
import { useLiveBilling } from "@/hooks/use-live-billing"
import type { BillingSummary } from "@/lib/polar/plan"

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
  games,
  billing: initialBilling,
  upgradeHref,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  games: Game[]
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

  /**
   * `listGames` already sorts pinned-first, so the split here is a single
   * pass over an already-ordered list rather than a second sort — a game
   * only ever shows up in one of the two groups, never both.
   */
  const pinnedGames = games.filter((game) => game.pinnedAt !== null)
  const recentGames = games.filter((game) => game.pinnedAt === null)

  const pathname = usePathname()
  const router = useRouter()
  const isMac = useIsMac()
  const { state, setOpenMobile } = useSidebar()
  const [searchOpen, setSearchOpen] = useState(false)

  const newGameHint = isMac ? "⇧⌘O" : "Ctrl Shift O"
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
      <CommandPalette
        games={games}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
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
                    aria-label="Search"
                    onClick={() => setSearchOpen(true)}
                    className="group-data-[collapsible=icon]:hidden [&_svg]:size-5!"
                  />
                }
              >
                <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>
                <span className="text-[13px] font-medium">Search</span>
                <Kbd>{searchHint}</Kbd>
              </TooltipContent>
            </Tooltip>
            {/**
             * The toggle carries a chord too — `SidebarProvider` binds it, not
             * this file — and an unannounced shortcut is one nobody uses.
             */}
            <Tooltip>
              <TooltipTrigger
                render={<SidebarTrigger className="[&_svg]:size-5!" />}
              />
              <TooltipContent
                sideOffset={state === "expanded" ? 10 : 25}
                side={state === "expanded" ? "bottom" : "right"}
              >
                <span className="text-[13px] font-medium">Toggle sidebar</span>
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
                            New game
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
                    <span>New game</span>
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
                            Search
                          </span>
                          <Kbd>{searchHint}</Kbd>
                        </>
                      ),
                      sideOffset: 25,
                    }}
                  >
                    <HugeiconsIcon icon={SearchIcon} />
                    <span>Search</span>
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
                                Recents
                              </span>
                            ),
                            sideOffset: 25,
                          }}
                        >
                          <HugeiconsIcon icon={MessageCircleIcon} />
                          <span>Recents</span>
                        </SidebarMenuButton>
                      }
                    />
                    <PopoverContent
                      side="right"
                      align="start"
                      className="gap-1.5 p-2"
                    >
                      <PopoverHeader className="px-2 pt-1">
                        <PopoverTitle className="text-xs text-muted-foreground">
                          Recents
                        </PopoverTitle>
                      </PopoverHeader>
                      {games.length === 0 ? (
                        <Empty className="p-3">
                          <EmptyDescription className="text-xs">
                            Your games will live here.
                          </EmptyDescription>
                        </Empty>
                      ) : (
                        <SidebarMenu>
                          {games.map((game) => (
                            <GameRow key={game.id} game={game} closeOnSelect />
                          ))}
                        </SidebarMenu>
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
              <SidebarGroupLabel>Pinned</SidebarGroupLabel>
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
            <SidebarGroupLabel>Recents</SidebarGroupLabel>
            <SidebarGroupContent className="no-scrollbar min-h-0 flex-1 scroll-fade overflow-x-hidden overflow-y-auto overscroll-contain pb-2">
              {games.length === 0 ? (
                <Empty className="border p-3">
                  <EmptyDescription className="text-xs">
                    Your games will live here.
                  </EmptyDescription>
                </Empty>
              ) : (
                <SidebarMenu>
                  {recentGames.map((game) => (
                    <GameRow key={game.id} game={game} />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UpgradeCard plan={billing.plan} href={upgradeHref} />
          <SidebarMenu>
            <CreditsButton {...billing} className={MENU_ICON} />
          </SidebarMenu>
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
