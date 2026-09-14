"use client"

import { useRouter } from "next/navigation"
import {
  useClerk,
  useOrganization,
  useOrganizationList,
  useUser,
} from "@clerk/nextjs"
import {
  Logout01Icon,
  PlusSignIcon,
  Settings01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserCircleIcon,
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
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

function initials(name: string | null | undefined) {
  return (name ?? "?").trim().charAt(0).toUpperCase()
}

/**
 * Organizations are square and people are round, the same convention Clerk's
 * own components follow, so the two avatars in the menu cannot be mistaken for
 * one another.
 */
function OrgAvatar({
  name,
  imageUrl,
  className = "size-8",
}: {
  name: string
  imageUrl?: string
  className?: string
}) {
  return (
    <Avatar className={cn("rounded-lg after:rounded-lg", className)}>
      <AvatarImage src={imageUrl} alt={name} className="rounded-lg" />
      <AvatarFallback className="rounded-lg">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

/**
 * The account row at the foot of the sidebar: the active organization and the
 * signed-in user behind one menu.
 *
 * It replaces Clerk's `OrganizationSwitcher` and `UserButton`, which render as
 * two unrelated widgets with their own sizing and do not follow the rail when
 * the sidebar collapses. Only the trigger and the menu are ours — account and
 * organization management still open Clerk's modals, because MFA, passwords,
 * sessions and membership screens are not worth rebuilding.
 */
export function NavUser() {
  const router = useRouter()
  const { isMobile, state } = useSidebar()
  const { user, isLoaded: userLoaded } = useUser()
  const { organization } = useOrganization()
  const { setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const {
    signOut,
    openUserProfile,
    openOrganizationProfile,
    openCreateOrganization,
  } = useClerk()

  if (!userLoaded || !user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Skeleton className="h-12 w-full rounded-lg group-data-[collapsible=icon]:size-8" />
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const email = user.primaryEmailAddress?.emailAddress
  const title = organization?.name ?? user.fullName ?? email ?? "Account"

  /**
   * The layout's server components read `orgId` from the session, so the
   * games list and the credit balance are for the previous organization until
   * the route is rendered again.
   */
  async function switchTo(organizationId: string) {
    if (!setActive || organizationId === organization?.id) return
    await setActive({ organization: organizationId })
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={state === "collapsed" ? title : undefined}
                className="aria-expanded:bg-sidebar-accent"
              />
            }
          >
            {organization ? (
              <OrgAvatar
                name={organization.name}
                imageUrl={organization.imageUrl}
              />
            ) : (
              <Avatar className="size-8">
                <AvatarImage src={user.imageUrl} alt={user.fullName ?? ""} />
                <AvatarFallback>
                  {initials(user.fullName ?? email)}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {email}
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
                  <AvatarImage src={user.imageUrl} alt={user.fullName ?? ""} />
                  <AvatarFallback>
                    {initials(user.fullName ?? email)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">
                    {user.fullName ?? email}
                  </span>
                  {user.fullName && (
                    <span className="truncate text-xs text-muted-foreground">
                      {email}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Organizations</DropdownMenuLabel>
              {userMemberships.data?.map(({ organization: org }) => (
                <DropdownMenuItem key={org.id} onClick={() => switchTo(org.id)}>
                  <OrgAvatar
                    name={org.name}
                    imageUrl={org.imageUrl}
                    className="size-5"
                  />
                  <span className="flex-1 truncate">{org.name}</span>
                  {org.id === organization?.id && (
                    <HugeiconsIcon icon={Tick02Icon} />
                  )}
                </DropdownMenuItem>
              ))}
              {userMemberships.hasNextPage && (
                <DropdownMenuItem
                  closeOnClick={false}
                  onClick={() => userMemberships.fetchNext?.()}
                  className="text-muted-foreground"
                >
                  Show more
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openCreateOrganization()}>
                <HugeiconsIcon icon={PlusSignIcon} />
                Create organization
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {organization && (
                <DropdownMenuItem onClick={() => openOrganizationProfile()}>
                  <HugeiconsIcon icon={Settings01Icon} />
                  Organization settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openUserProfile()}>
                <HugeiconsIcon icon={UserCircleIcon} />
                Account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
            >
              <HugeiconsIcon icon={Logout01Icon} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
