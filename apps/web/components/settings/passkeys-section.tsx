"use client"

import { useEffect, useState } from "react"
import { FingerPrintIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNow } from "date-fns"
import { getAuthenticatorName } from "@better-auth/passkey"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Label } from "@workspace/ui/components/label"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "@workspace/ui/components/toast"

import { authClient } from "@/lib/auth-client"
import {
  SettingsHeading,
  SettingsRow,
  SettingsRows,
} from "@/components/settings/settings-group"

/** One row from `authClient.passkey.listUserPasskeys()`. */
type Passkey = NonNullable<
  Awaited<ReturnType<typeof authClient.passkey.listUserPasskeys>>["data"]
>[number]

/**
 * What to call a passkey the user never named.
 *
 * `getAuthenticatorName` maps the AAGUID — the authenticator MODEL's id — to
 * a provider name, and the plugin already tries this server-side at
 * registration. It is repeated here because the lookup happens at read time
 * by design: a passkey registered before a provider was added to the map
 * picks up its name the next time this list renders, with no migration.
 */
function passkeyLabel(passkey: Passkey) {
  return passkey.name || getAuthenticatorName(passkey.aaguid) || "Passkey"
}

/**
 * The account's registered passkeys, with a way to add, rename and remove
 * them.
 *
 * # Why this is not gated behind the TOTP step-up
 *
 * `lib/two-factor-step-up.ts` closes the 2FA endpoints over HTTP because a
 * stolen session could otherwise read the TOTP secret or turn the second
 * factor off. Registering a passkey is not that: it demands a WebAuthn
 * ceremony on a device the attacker would also have to hold, and it ADDS a
 * factor rather than weakening one. Deleting a passkey is the same shape as
 * revoking a session, which this dialog already allows from a plain session.
 */
export function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Passkey | null>(null)

  async function loadPasskeys() {
    const { data } = await authClient.passkey.listUserPasskeys()
    setPasskeys(data ?? [])
  }

  useEffect(() => {
    loadPasskeys().finally(() => setLoading(false))
  }, [])

  /**
   * `addPasskey` never throws and never rejects — the plugin documents that
   * `throw: true` has no effect on the register response — so every failure
   * comes back in the resolved value with a SimpleWebAuthn `code`.
   *
   * `ERROR_CEREMONY_ABORTED` is the user dismissing the browser's own
   * prompt. That is a decision, not a fault: it gets no toast at all, because
   * telling someone "cancelled" right after they pressed cancel is noise.
   * Everything else is a real failure and says so.
   */
  async function addPasskey() {
    setAdding(true)

    const result = await authClient.passkey.addPasskey({})

    if (result?.error) {
      /**
       * The declared error type is a union: the WebAuthn failures carry a
       * `code`, a plain HTTP failure from the verify call does not — hence
       * the `in` check rather than reaching for the property directly.
       */
      const cancelled =
        "code" in result.error && result.error.code === "ERROR_CEREMONY_ABORTED"

      if (!cancelled) {
        toast.add({
          type: "error",
          title: "Could not add the passkey",
          description: result.error.message,
        })
      }
    } else {
      await loadPasskeys()
      toast.add({ type: "success", title: "Passkey added" })
    }

    setAdding(false)
  }

  async function deletePasskey(passkey: Passkey) {
    setBusyId(passkey.id)

    const { error } = await authClient.passkey.deletePasskey({ id: passkey.id })

    if (error) {
      toast.add({
        type: "error",
        title: "Could not remove the passkey",
        description: error.message,
      })
    } else {
      await loadPasskeys()
      toast.add({ type: "success", title: "Passkey removed" })
    }

    setBusyId(null)
  }

  async function renamePasskey(name: string) {
    if (!renaming) return

    setBusyId(renaming.id)
    setRenaming(null)

    const { error } = await authClient.passkey.updatePasskey({
      id: renaming.id,
      name,
    })

    if (error) {
      toast.add({
        type: "error",
        title: "Could not rename the passkey",
        description: error.message,
      })
    } else {
      await loadPasskeys()
      toast.add({ type: "success", title: "Passkey renamed" })
    }

    setBusyId(null)
  }

  return (
    <section className="flex flex-col gap-3">
      <SettingsHeading
        title="Passkeys"
        description="Passkeys are a secure way to sign in to your Numa account"
      />

      <SettingsRows>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>
              {loading
                ? "Passkeys"
                : passkeys.length === 0
                  ? "No passkeys registered"
                  : passkeys.length === 1
                    ? "1 passkey"
                    : `${passkeys.length} passkeys`}
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button variant="ghost" disabled={adding} onClick={addPasskey}>
              {adding && <Spinner />}
              New passkey
            </Button>
          </ItemActions>
        </SettingsRow>

        {passkeys.map((passkey) => (
          <SettingsRow
            key={passkey.id}
            className="transition-colors hover:bg-muted/60"
          >
            <ItemMedia className="size-8 rounded-lg bg-background text-muted-foreground">
              <HugeiconsIcon
                icon={FingerPrintIcon}
                className="size-4"
                strokeWidth={2}
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{passkeyLabel(passkey)}</ItemTitle>
              <ItemDescription>
                Added{" "}
                {formatDistanceToNow(new Date(passkey.createdAt), {
                  addSuffix: true,
                })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {busyId === passkey.id ? (
                <Spinner className="size-4" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Manage ${passkeyLabel(passkey)}`}
                      />
                    }
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto">
                    <DropdownMenuItem onClick={() => setRenaming(passkey)}>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => deletePasskey(passkey)}
                    >
                      Remove passkey
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ItemActions>
          </SettingsRow>
        ))}
      </SettingsRows>

      <RenamePasskeyDialog
        passkey={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onRename={renamePasskey}
      />
    </section>
  )
}

/**
 * The rename prompt: one field, over the settings dialog.
 *
 * The input is keyed on the passkey's id so it remounts — and therefore
 * re-reads `defaultValue` — whenever a different row opens it. Without the
 * key React would keep the previous row's text, which is the classic bug for
 * a small dialog reused across a list.
 *
 * Submitted through a `<form>` rather than an `onClick` so Enter works and
 * `required` is enforced by the browser: the endpoint rejects an empty name
 * (`z.string().trim().min(1)`), so submitting one would be a round trip to
 * learn what the form already knows.
 */
function RenamePasskeyDialog({
  passkey,
  onOpenChange,
  onRename,
}: {
  passkey: Passkey | null
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
}) {
  return (
    <Dialog open={passkey !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault()

            const name = new FormData(event.currentTarget)
              .get("name")
              ?.toString()
              .trim()

            if (name) onRename(name)
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename passkey</DialogTitle>
            <DialogDescription>
              Give this passkey a name you will recognize on the device it lives
              on.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="passkey-name">Name</Label>
            <Input
              key={passkey?.id}
              id="passkey-name"
              name="name"
              autoFocus
              required
              maxLength={64}
              defaultValue={passkey ? passkeyLabel(passkey) : ""}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
