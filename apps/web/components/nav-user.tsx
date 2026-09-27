"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  Logout01Icon,
  Settings02Icon,
  UserIcon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserAdd01Icon,
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

import { Spinner } from "@/components/localized-spinner"

import { authClient } from "@/lib/auth-client"
import { initials } from "@/lib/format/initials"
import { useIsMac } from "@/hooks/use-is-mac"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"
import type { BillingPlan } from "@/lib/polar/plan"

function AccountIdentity({
  name,
  image,
  subtitle,
}: {
  name: string
  image: string | null | undefined
  subtitle: string
}) {
  return (
    <>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={image ?? undefined} alt={name} />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </>
  )
}

/**
 * One entry from `listDeviceSessions()`: a session cookie this browser holds
 * and the account it belongs to.
 */
type DeviceSession = NonNullable<
  Awaited<ReturnType<typeof authClient.multiSession.listDeviceSessions>>["data"]
>[number]

/**
 * The sidebar account row shows the active user and plan. Better Auth's
 * multi-session plugin lets this menu switch between signed-in accounts on
 * this device; `user.id` remains the tenant boundary.
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
export function NavUser({ plan }: { plan: BillingPlan }) {
  const router = useRouter()
  const t = useTranslations("Shell")
  const { isMobile, state } = useSidebar()
  const { data: session, isPending } = authClient.useSession()
  const { openSettings } = useSettingsDialog()
  const isMac = useIsMac()
  const settingsHint = isMac ? "⌘⇧," : "Ctrl ⇧ ,"

  const [accounts, setAccounts] = useState<DeviceSession[]>([])
  const [accountListState, setAccountListState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle")
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(
    null
  )
  const [signingOut, setSigningOut] = useState(false)
  const accountLoadInFlight = useRef(false)
  const actionInFlight = useRef(false)

  /**
   * Fetched when the menu opens, not on mount. Every page that renders the
   * sidebar would otherwise pay for a list nobody has asked to see yet, and
   * the answer is stale-prone in exactly the way that matters — another tab
   * signing a second account in — so fetching it at the moment it is about
   * to be read is both cheaper and more correct.
   */
  async function loadAccounts() {
    if (accountLoadInFlight.current) return

    accountLoadInFlight.current = true
    setAccountListState("loading")

    try {
      const { data, error } = await authClient.multiSession.listDeviceSessions()

      if (error) {
        setAccountListState("error")
        return
      }

      setAccounts(data ?? [])
      setAccountListState("loaded")
    } catch {
      setAccountListState("error")
    } finally {
      accountLoadInFlight.current = false
    }
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
  async function switchAccount(sessionId: string, sessionToken: string) {
    if (actionInFlight.current) return

    actionInFlight.current = true
    setSwitchingSessionId(sessionId)
    let navigating = false

    try {
      const { error } = await authClient.multiSession.setActive({
        sessionToken,
      })

      if (error) {
        toast.add({
          type: "error",
          title: t("couldNotSwitchAccount"),
          description: t("pleaseTryAgain"),
        })
        return
      }

      window.location.assign("/")
      navigating = true
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotSwitchAccount"),
        description: t("pleaseTryAgain"),
      })
    } finally {
      if (!navigating) {
        actionInFlight.current = false
        setSwitchingSessionId(null)
      }
    }
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
  const planLabel = {
    none: t("planUnavailable"),
    free: t("free"),
    pro: "Pro",
    max: "Max",
  }[plan]

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
  const isActionPending = switchingSessionId !== null || signingOut

  async function signOut() {
    if (actionInFlight.current) return

    actionInFlight.current = true
    setSigningOut(true)
    let navigating = false

    try {
      const { error } = await authClient.signOut()

      if (error) {
        toast.add({
          type: "error",
          title: t("couldNotSignOut"),
          description: t("pleaseTryAgain"),
        })
        return
      }

      navigating = true
      router.push("/sign-in")
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotSignOut"),
        description: t("pleaseTryAgain"),
      })
    } finally {
      if (!navigating) {
        actionInFlight.current = false
        setSigningOut(false)
      }
    }
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
            <AccountIdentity
              name={title}
              image={user.image}
              subtitle={planLabel}
            />
            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  disabled={isActionPending}
                  className="gap-2 py-2"
                >
                  <AccountIdentity
                    name={title}
                    image={user.image}
                    subtitle={planLabel}
                  />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-56">
                  {accountListState === "loading" ||
                  accountListState === "idle" ? (
                    <DropdownMenuItem disabled>
                      <Spinner />
                      {t("loadingAccounts")}
                    </DropdownMenuItem>
                  ) : accountListState === "error" ? (
                    <DropdownMenuItem onClick={loadAccounts}>
                      {t("retryLoadingAccounts")}
                    </DropdownMenuItem>
                  ) : (
                    switchableAccounts.map(
                      ({ session: deviceSession, user: account }) => {
                        const label = account.name || account.email
                        const isActive = deviceSession.id === session.session.id
                        const isSwitching = switchingSessionId === deviceSession.id

                        return (
                          <DropdownMenuItem
                            key={deviceSession.id}
                            disabled={isActionPending || isActive}
                            onClick={() => {
                              // eslint-disable-next-line react-hooks/refs -- read only after click.
                              void switchAccount(
                                deviceSession.id,
                                deviceSession.token
                              )
                            }}
                          >
                            <AccountIdentity
                              name={label}
                              image={account.image}
                              subtitle={account.email}
                            />
                            {isSwitching ? (
                              <Spinner className="ml-auto" />
                            ) : (
                              isActive && (
                                <HugeiconsIcon
                                  icon={Tick02Icon}
                                  className="ml-auto size-4"
                                />
                              )
                            )}
                          </DropdownMenuItem>
                        )
                      }
                    )
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isActionPending}
                    onClick={() => router.push("/sign-in")}
                  >
                    <HugeiconsIcon icon={UserAdd01Icon} />
                    {t("addAccount")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={isActionPending}
                onClick={() => router.push("/profile")}
              >
                <HugeiconsIcon icon={UserIcon} />
                {t("profile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isActionPending}
                onClick={() => openSettings()}
              >
                <HugeiconsIcon icon={Settings02Icon} />
                {t("settings")}
                <DropdownMenuShortcut>{settingsHint}</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isActionPending}
              onClick={signOut}
            >
              {signingOut ? <Spinner /> : <HugeiconsIcon icon={Logout01Icon} />}
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
