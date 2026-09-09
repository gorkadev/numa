"use client"

import { useEffect, useSyncExternalStore } from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import {
  Coins01Icon,
  MessageCircleIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import { Empty, EmptyDescription } from "@workspace/ui/components/empty"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  Popover,
  PopoverClose,
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
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { GameMenu } from "@/components/game-menu"

/**
 * What every rail button wears when the sidebar is collapsed.
 *
 * The default is a 32px button holding a 16px icon, which reads as a smudge at
 * rail width. Trimming the padding to 6px is what buys the icon its extra 4px —
 * the button itself cannot grow, because `SidebarGroup`'s own padding is what
 * bounds it.
 */
const COLLAPSED_ICON =
  "group-data-[collapsible=icon]:p-1.5! group-data-[collapsible=icon]:[&_svg]:size-5"

/**
 * The chord that starts a new game, spelled once so the handler and the hint in
 * the tooltip can never drift apart.
 */
const NEW_GAME_KEY = "o"

/**
 * A subscription that never fires, because the platform cannot change under a
 * running tab. `useSyncExternalStore` still needs one.
 */
const noSubscribe = () => () => {}

/**
 * The modifier symbols the running platform actually uses.
 *
 * Read through `useSyncExternalStore` rather than in an effect: the server has
 * no platform to ask, so the server snapshot is the portable spelling and the
 * client's is whatever the browser reports. React swaps the two as part of
 * hydration, which is both warning-free and one render shorter than settling it
 * from an effect afterwards.
 */
function useShortcutLabel() {
  return useSyncExternalStore(
    noSubscribe,
    () =>
      /mac|iphone|ipad/i.test(navigator.userAgent) ? "⇧⌘O" : "Ctrl Shift O",
    () => "Ctrl Shift O"
  )
}

export function AppSidebar({
  games,
  ...props
}: React.ComponentProps<typeof Sidebar> & { games: Game[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const shortcutLabel = useShortcutLabel()

  /**
   * The shortcut lives on the window rather than on the link, because a link
   * only hears a key when it already has focus and the whole point of a chord
   * is reaching the thing from anywhere — including from inside the composer.
   *
   * Shift is required alongside the platform modifier so this cannot be mistaken
   * for the browser's own ⌘O, and `event.code` rather than `event.key` is what
   * gets compared: with Shift held, `key` on some layouts is already the shifted
   * character, while `code` names the physical key regardless.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.code === `Key${NEW_GAME_KEY.toUpperCase()}` &&
        event.shiftKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        router.push("/")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router])

  return (
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
         * `!` rather than a plain size: `Button` sizes its icons through
         * `[&_svg:not([class*='size-'])]`, a more specific selector than
         * anything a class on the button can express, so importance is the only
         * way over it.
         */}
        <SidebarTrigger className="[&_svg]:size-5!" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/**
             * "New game" and the collapsed "Recents" opener share one menu on
             * purpose. They used to sit in separate `SidebarGroup`s, and a group
             * carries its own padding — so once collapsed the rail showed two
             * icons pushed apart by a gap that meant nothing, since the label
             * justifying the split is hidden at that width anyway.
             */}
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={COLLAPSED_ICON}
                  isActive={pathname === "/"}
                  /**
                   * An object rather than a string because the hint carries the
                   * chord as well as the name. `SidebarMenuButton` already hides
                   * the whole thing while the sidebar is expanded, where the
                   * label is right there on the row.
                   */
                  tooltip={{
                    children: (
                      <>
                        <span className="text-[13px] font-medium">
                          New game
                        </span>
                        <Kbd>{shortcutLabel}</Kbd>
                      </>
                    ),
                    sideOffset: 25,
                  }}
                  render={<Link href="/" />}
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} />
                  <span>New game</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
                <Popover>
                  <PopoverTrigger
                    render={
                      <SidebarMenuButton
                        className={COLLAPSED_ICON}
                        tooltip={{
                          children: (
                            <span className="text-[13px] font-medium">
                              Recents
                            </span>
                          ),
                          sideOffset: 25
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
                          <SidebarMenuItem key={game.id}>
                            <PopoverClose
                              nativeButton={false}
                              render={
                                <SidebarMenuButton
                                  isActive={pathname === `/games/${game.id}`}
                                  render={<Link href={`/games/${game.id}`} />}
                                >
                                  <span className="truncate">{game.title}</span>
                                </SidebarMenuButton>
                              }
                            />
                          </SidebarMenuItem>
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
         * Hidden wholesale when collapsed, rather than hiding each thing inside
         * it: an empty group still contributes its padding, which is the other
         * half of the gap the rail used to show.
         */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            {games.length === 0 ? (
              <Empty className="border p-3">
                <EmptyDescription className="text-xs">
                  Your games will live here.
                </EmptyDescription>
              </Empty>
            ) : (
              <SidebarMenu>
                {games.map((game) => (
                  <SidebarMenuItem key={game.id}>
                    <SidebarMenuButton
                      isActive={pathname === `/games/${game.id}`}
                      tooltip={game.title}
                      render={<Link href={`/games/${game.id}`} />}
                    >
                      <span className="truncate">{game.title}</span>
                    </SidebarMenuButton>
                    {/**
                     * A sibling of the row rather than something inside it:
                     * the row *is* a link, so a button nested in it would be
                     * invalid markup and every click on the menu would also
                     * navigate. `SidebarMenuAction` is the slot for exactly
                     * this — absolutely positioned over the row's right edge,
                     * which the row already reserves space for, revealed on
                     * hover and kept visible while the menu is open.
                     */}
                    <GameMenu
                      gameId={game.id}
                      title={game.title}
                      trigger={<SidebarMenuAction showOnHover />}
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className={COLLAPSED_ICON} tooltip="Credits">
              <HugeiconsIcon icon={Coins01Icon} />
              <span>Credits</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>$1.00</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
          <span className="group-data-[collapsible=icon]:hidden">
            <OrganizationSwitcher />
          </span>
          <UserButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
