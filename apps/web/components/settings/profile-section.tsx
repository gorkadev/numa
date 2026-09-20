"use client"

import { useEffect, useRef, useState } from "react"
import {
  GithubIcon,
  GoogleIcon,
  Logout01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "@workspace/ui/components/toast"

import { authClient } from "@/lib/auth-client"
import { initials } from "@/lib/format/initials"
import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"

type LinkedAccount = NonNullable<
  Awaited<ReturnType<typeof authClient.listAccounts>>["data"]
>[number]

const PROVIDERS: Record<string, { label: string; icon: typeof GithubIcon }> = {
  github: { label: "GitHub", icon: GithubIcon },
  google: { label: "Google", icon: GoogleIcon },
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again."
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup>
        {["picture", "name", "email"].map((row) => (
          <SettingsRow key={row}>
            <ItemContent className="gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-52" />
            </ItemContent>
            <Skeleton className="h-8 w-24" />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </div>
  )
}

export function ProfileSection() {
  const router = useRouter()
  const {
    data: session,
    error: sessionError,
    isPending: sessionPending,
    refetch: refetchSession,
  } = authClient.useSession()
  const [name, setName] = useState("")
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [removingImage, setRemovingImage] = useState(false)
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const accountsRequestId = useRef(0)
  const mountedRef = useRef(true)
  const [signingOut, setSigningOut] = useState(false)
  const signOutInFlight = useRef(false)
  const user = session?.user

  if (user && seededFor !== user.id) {
    setSeededFor(user.id)
    setName(user.name ?? "")
  }

  async function loadAccounts() {
    if (!mountedRef.current) return false

    const requestId = ++accountsRequestId.current
    setAccountsLoading(true)
    setAccountsError(null)

    try {
      const { data, error } = await authClient.listAccounts()
      if (!mountedRef.current || requestId !== accountsRequestId.current) {
        return false
      }
      if (error) {
        setAccountsError(error.message ?? "Please try again.")
        return false
      }
      setAccounts(data ?? [])
      return true
    } catch (error) {
      if (mountedRef.current && requestId === accountsRequestId.current) {
        setAccountsError(errorMessage(error))
      }
      return false
    } finally {
      if (mountedRef.current && requestId === accountsRequestId.current) {
        setAccountsLoading(false)
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void Promise.resolve().then(loadAccounts)

    return () => {
      mountedRef.current = false
    }
  }, [])

  async function saveName() {
    const next = name.trim()
    if (!next || next === user?.name) {
      setName(user?.name ?? "")
      return
    }

    setSavingName(true)
    try {
      const { error } = await authClient.updateUser({ name: next })
      if (error) {
        toast.add({
          type: "error",
          title: "Could not save your name",
          description: error.message,
        })
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not save your name",
        description: errorMessage(error),
      })
    } finally {
      if (mountedRef.current) setSavingName(false)
    }
  }

  async function removeImage() {
    setRemovingImage(true)
    try {
      const { error } = await authClient.updateUser({ image: null })
      if (error) {
        toast.add({
          type: "error",
          title: "Could not remove your picture",
          description: error.message,
        })
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not remove your picture",
        description: errorMessage(error),
      })
    } finally {
      if (mountedRef.current) setRemovingImage(false)
    }
  }

  async function signOut() {
    if (signOutInFlight.current) return
    signOutInFlight.current = true
    setSigningOut(true)
    let navigating = false
    try {
      const { error } = await authClient.signOut()
      if (error) {
        toast.add({
          type: "error",
          title: "Could not sign out",
          description: error.message,
        })
        return
      }
      navigating = true
      router.push("/sign-in")
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not sign out",
        description: errorMessage(error),
      })
    } finally {
      if (!navigating && mountedRef.current) {
        signOutInFlight.current = false
        setSigningOut(false)
      }
    }
  }

  if (sessionPending) return <ProfileSkeleton />
  if (sessionError) {
    return (
      <SettingsGroup>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Could not load your profile</ItemTitle>
            <ItemDescription>{sessionError.message}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchSession()}
            >
              Retry
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    )
  }
  if (!user) return null

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Profile picture</ItemTitle>
            <ItemDescription>
              {user.image
                ? "Taken from the account you signed in with."
                : "Your initials are used while you have no picture."}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {user.image && (
              <Button
                variant="ghost"
                size="sm"
                disabled={removingImage}
                onClick={removeImage}
              >
                {removingImage && <Spinner />}Remove
              </Button>
            )}
            <Avatar>
              <AvatarImage
                src={user.image ?? undefined}
                alt={user.name || user.email}
              />
              <AvatarFallback>
                {initials(user.name || user.email)}
              </AvatarFallback>
            </Avatar>
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Full name</ItemTitle>
          </ItemContent>
          <ItemActions>
            {savingName && <Spinner className="size-4" />}
            <Input
              className="h-8 w-52"
              value={name}
              disabled={savingName}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
                if (event.key === "Escape") {
                  setName(user.name ?? "")
                  event.currentTarget.blur()
                }
              }}
            />
          </ItemActions>
        </SettingsRow>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Email</ItemTitle>
            <ItemDescription>
              Managed by the account you sign in with.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>

      {(accountsLoading || accountsError || accounts.length > 0) && (
        <SettingsGroup
          title="Connected accounts"
          description="The providers you can sign in to Numa with"
        >
          {accountsLoading ? (
            <SettingsRow size="sm">
              <Skeleton className="size-8 rounded-lg" />
              <ItemContent className="gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-36" />
              </ItemContent>
            </SettingsRow>
          ) : accountsError ? (
            <SettingsRow size="sm">
              <ItemContent>
                <ItemTitle>Could not load connected accounts</ItemTitle>
                <ItemDescription>{accountsError}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadAccounts()}
                >
                  Retry
                </Button>
              </ItemActions>
            </SettingsRow>
          ) : (
            accounts.map((account) => {
              const provider = PROVIDERS[account.providerId]
              return (
                <SettingsRow key={account.id} size="sm">
                  <ItemMedia className="size-8 rounded-lg bg-background text-foreground">
                    {provider ? (
                      <HugeiconsIcon
                        icon={provider.icon}
                        className="size-4"
                        strokeWidth={2}
                      />
                    ) : null}
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {provider?.label ?? account.providerId}
                    </ItemTitle>
                    <ItemDescription>
                      Connected{" "}
                      {format(new Date(account.createdAt), "d MMM yyyy")}
                    </ItemDescription>
                  </ItemContent>
                </SettingsRow>
              )
            })
          )}
        </SettingsGroup>
      )}

      <SettingsGroup>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Sign out</ItemTitle>
            <ItemDescription>End your session on this device.</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="destructive"
              size="sm"
              disabled={signingOut}
              onClick={signOut}
            >
              {signingOut ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              )}
              Sign out
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
