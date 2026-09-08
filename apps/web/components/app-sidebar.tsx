"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"
import {
  BubbleChatIcon,
  Coins01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Game } from "@workspace/db/schema"
import { Empty, EmptyDescription } from "@workspace/ui/components/empty"
import {
  Popover,
  PopoverClose,
  PopoverContent,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

export function AppSidebar({
  games,
  ...props
}: React.ComponentProps<typeof Sidebar> & { games: Game[] }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
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
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={<Link href="/" />}
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} />
                  <span>New game</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            {games.length === 0 ? (
              <Empty className="border p-3 group-data-[collapsible=icon]:hidden">
                <EmptyDescription className="text-xs">
                  Your games will live here.
                </EmptyDescription>
              </Empty>
            ) : (
              <SidebarMenu className="group-data-[collapsible=icon]:hidden">
                {games.map((game) => (
                  <SidebarMenuItem key={game.id}>
                    <SidebarMenuButton
                      isActive={pathname === `/games/${game.id}`}
                      tooltip={game.title}
                      render={<Link href={`/games/${game.id}`} />}
                    >
                      <span className="truncate">{game.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <Popover>
                  <PopoverTrigger
                    render={
                      <SidebarMenuButton>
                        <HugeiconsIcon icon={BubbleChatIcon} />
                        <span>Recents</span>
                      </SidebarMenuButton>
                    }
                  />
                  <PopoverContent
                    side="right"
                    align="start"
                    className="gap-1 p-2"
                  >
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
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
