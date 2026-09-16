"use client"

import { useEffect, useState } from "react"
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
import { Spinner } from "@workspace/ui/components/spinner"

import { authClient } from "@/lib/auth-client"
import { initials } from "@/lib/format/initials"
import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"

/** One row from `authClient.listAccounts()`. */
type LinkedAccount = NonNullable<
  Awaited<ReturnType<typeof authClient.listAccounts>>["data"]
>[number]

const PROVIDERS: Record<string, { label: string; icon: typeof GithubIcon }> = {
  github: { label: "GitHub", icon: GithubIcon },
  google: { label: "Google", icon: GoogleIcon },
}

/**
 * The Profile section: the handful of identity fields this application is
 * actually allowed to change, plus the providers behind the ones it is not.
 *
 * # Why the name is the only editable field
 *
 * Better Auth's `/update-user` accepts exactly `name` and `image` (it throws
 * `EMAIL_CAN_NOT_BE_UPDATED` the moment a body carries an email — see
 * `api/routes/update-user.mjs`). Email goes through `/change-email`, which
 * refuses outright unless at least one email-delivery flow is configured:
 * for a verified address — and every address here is verified, because it
 * came from Google or GitHub — it needs `emailVerification.sendVerification
 * Email`. This project has no email provider at all (`lib/auth.ts` says so
 * where it explains why `emailAndPassword` is off), so an "edit" affordance
 * on that row could only ever produce a 400. It is shown as what it is:
 * a value owned by the identity provider.
 *
 * `image` is technically writable, but there is nowhere to upload a file to —
 * so the only honest control is removing the provider's photo and falling
 * back to initials, which is what the picture row offers.
 */
export function ProfileSection() {
  const router = useRouter()
  const { data: session } = authClient.useSession()

  const [name, setName] = useState("")
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [removingImage, setRemovingImage] = useState(false)

  const [accounts, setAccounts] = useState<LinkedAccount[]>([])

  const user = session?.user

  /**
   * The name input is seeded from the session exactly once per identity,
   * during render rather than from an effect.
   *
   * It cannot simply mirror `user.name`: `authClient.updateUser` pings the
   * session atom, so the session object changes identity while the field is
   * being edited, and re-seeding on every change would erase what is being
   * typed. React's documented answer for "derive state from props, but only
   * when they actually change" is this adjust-during-render pattern — an
   * effect would render the stale value first, then immediately render
   * again.
   */
  if (user && seededFor !== user.id) {
    setSeededFor(user.id)
    setName(user.name ?? "")
  }

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => setAccounts(data ?? []))
  }, [])

  if (!user) return null

  async function saveName() {
    const next = name.trim()

    if (!next || next === user!.name) {
      setName(user!.name ?? "")
      return
    }

    setSavingName(true)
    await authClient.updateUser({ name: next })
    setSavingName(false)
  }

  async function removeImage() {
    setRemovingImage(true)
    await authClient.updateUser({ image: null })
    setRemovingImage(false)
  }

  async function signOut() {
    await authClient.signOut()
    router.push("/sign-in")
  }

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
                {removingImage && <Spinner />}
                Remove
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

      {accounts.length > 0 && (
        <SettingsGroup
          title="Connected accounts"
          description="The providers you can sign in to Numa with"
        >
          {accounts.map((account) => {
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
                  <ItemTitle>{provider?.label ?? account.providerId}</ItemTitle>
                  <ItemDescription>
                    Connected{" "}
                    {format(new Date(account.createdAt), "d MMM yyyy")}
                  </ItemDescription>
                </ItemContent>
              </SettingsRow>
            )
          })}
        </SettingsGroup>
      )}

      <SettingsGroup>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Sign out</ItemTitle>
            <ItemDescription>End your session on this device.</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="destructive" size="sm" onClick={signOut}>
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              Sign out
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
