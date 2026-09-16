"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Logout01Icon,
  Settings02Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserAdd01Icon,
  UserSwitchIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toast"

import { authClient } from "@/lib/auth-client"
import { initials } from "@/lib/format/initials"
import { useIsMac } from "@/hooks/use-is-mac"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"

/**
 * One entry from `listDeviceSessions()`: a session cookie this browser holds
 * and the account it belongs to.
 */
type DeviceSession = NonNullable<
  Awaited<ReturnType<typeof authClient.multiSession.listDeviceSessions>>["data"]
>[number]

/**
 * The account row at the foot of the sidebar: the signed-in user behind one
 * menu.
 *
 * This used to also hold Clerk's `OrganizationSwitcher` — an active
 * organization, a membership list, "Create organization" — none of which
 * exists any more, because this application has no organization concept.
 * `user.id` is the only tenant boundary left, so this row is now exactly what
 * its name says: one user's account, with nothing to switch between.
 *
 * "Settings" opens the settings dialog by writing `?settings=` to the URL
 * through `useSettingsDialog` rather than owning an `open` flag itself —
 * the dialog now renders from `components/app-settings.tsx`, mounted at the
 * `(app)` layout level, precisely because this component can unmount (the
 * mobile sidebar renders its content inside a `Drawer`) while the dialog
 * has to stay reachable. There is no Clerk-hosted profile modal to fall
 * back to for account management either (Better Auth ships no equivalent
 * prebuilt UI), so this application owns the surface itself rather than
 * leaving the menu item with nowhere to go.
 */
export function NavUser() {
  const router = useRouter()
  const { isMobile, state } = useSidebar()
  const { data: session, isPending } = authClient.useSession()
  const { openSettings } = useSettingsDialog()
  const isMac = useIsMac()
  const settingsHint = isMac ? "⌘⇧," : "Ctrl Shift ,"

  const [accounts, setAccounts] = useState<DeviceSession[]>([])

  /**
   * Fetched when the menu opens, not on mount. Every page that renders the
   * sidebar would otherwise pay for a list nobody has asked to see yet, and
   * the answer is stale-prone in exactly the way that matters — another tab
   * signing a second account in — so fetching it at the moment it is about
   * to be read is both cheaper and more correct.
   */
  async function loadAccounts() {
    const { data } = await authClient.multiSession.listDeviceSessions()
    setAccounts(data ?? [])
  }

  /**
   * Switching swaps which of the device's session cookies is the active one,
   * then reloads through the browser rather than `router.refresh()`.
   *
   * The tenant boundary in this application is `user.id` — games, usage,
   * billing — so every server component on screen was rendered for the
   * account being switched away from. A soft refresh would re-render them,
   * but it would also keep the client router cache and any client state
   * built from the old session. A full navigation to `/` is the honest
   * reset, and it is what the user asked for by changing accounts.
   */
  async function switchAccount(sessionToken: string) {
    const { error } = await authClient.multiSession.setActive({ sessionToken })

    if (error) {
      toast.add({
        type: "error",
        title: "Could not switch account",
        description: error.message,
      })
      return
    }

    window.location.assign("/")
  }

  if (isPending || !session) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Skeleton className="h-12 w-full rounded-lg group-data-[collapsible=icon]:size-8" />
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const { user } = session
  const title = user.name || user.email

  /**
   * The accounts to offer, with the active one guaranteed to be among them.
   *
   * `listDeviceSessions()` only returns sessions that carry a multi-session
   * cookie, and the active session does not necessarily have one: it was
   * created before this plugin existed, or it is the fifth one past
   * `maximumSessions`. A switcher that omits the account you are currently
   * using looks broken, so the active session is prepended from
   * `useSession()` — which always knows it — and filtered out of the fetched
   * list to avoid listing it twice.
   */
  const switchableAccounts = [
    { session: session.session, user },
    ...accounts.filter((entry) => entry.session.id !== session.session.id),
  ]

  async function signOut() {
    await authClient.signOut()
    router.push("/sign-in")
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => open && loadAccounts()}>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={state === "collapsed" ? title : undefined}
                className="aria-expanded:bg-sidebar-accent"
              />
            }
          >
            <Avatar className="size-8">
              <AvatarImage src={user.image ?? undefined} alt={title} />
              <AvatarFallback>{initials(title)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-foreground">
                <Avatar className="size-8">
                  <AvatarImage src={user.image ?? undefined} alt={title} />
                  <AvatarFallback>{initials(title)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{title}</span>
                  {user.name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => openSettings()}>
                <HugeiconsIcon icon={Settings02Icon} />
                Settings
                <DropdownMenuShortcut>{settingsHint}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={UserSwitchIcon} />
                  Switch account
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-56">
                  {switchableAccounts.map(
                    ({ session: deviceSession, user: account }) => {
                      const label = account.name || account.email
                      const isActive = deviceSession.id === session!.session.id

                      return (
                        <DropdownMenuItem
                          key={deviceSession.id}
                          onClick={() =>
                            isActive
                              ? undefined
                              : switchAccount(deviceSession.token)
                          }
                        >
                          <Avatar className="size-5">
                            <AvatarImage
                              src={account.image ?? undefined}
                              alt={label}
                            />
                            <AvatarFallback className="text-[0.5rem]">
                              {initials(label)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{label}</span>
                          {isActive && (
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              className="ml-auto size-4"
                            />
                          )}
                        </DropdownMenuItem>
                      )
                    }
                  )}
                  <DropdownMenuSeparator />
                  {/**
                   * Straight to the normal sign-in page: `proxy.ts` leaves
                   * `/sign-in` public rather than bouncing a signed-in
                   * browser away from it, and the multi-session plugin adds
                   * the new session's cookie beside the existing one instead
                   * of replacing it — so signing in again IS adding an
                   * account, with no separate flow to build.
                   */}
                  <DropdownMenuItem onClick={() => router.push("/sign-in")}>
                    <HugeiconsIcon icon={UserAdd01Icon} />
                    Add account
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={signOut}>
              <HugeiconsIcon icon={Logout01Icon} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
