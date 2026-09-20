"use client"

import { useEffect, useRef, useState } from "react"
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
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "@workspace/ui/components/toast"

import { authClient } from "@/lib/auth-client"
import {
  SettingsHeading,
  SettingsRow,
  SettingsRows,
} from "@/components/settings/settings-group"

type Passkey = NonNullable<
  Awaited<ReturnType<typeof authClient.passkey.listUserPasskeys>>["data"]
>[number]

function passkeyLabel(passkey: Passkey) {
  return passkey.name || getAuthenticatorName(passkey.aaguid) || "Passkey"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again."
}

export function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)
  const mountedRef = useRef(true)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<Passkey | null>(null)

  async function loadPasskeys() {
    if (!mountedRef.current) return false

    const id = ++requestId.current
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await authClient.passkey.listUserPasskeys()
      if (!mountedRef.current || id !== requestId.current) return false
      if (error) {
        setLoadError(error.message ?? "Please try again.")
        return false
      }
      setPasskeys(data ?? [])
      return true
    } catch (error) {
      if (mountedRef.current && id === requestId.current) {
        setLoadError(errorMessage(error))
      }
      return false
    } finally {
      if (mountedRef.current && id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void Promise.resolve().then(loadPasskeys)

    return () => {
      mountedRef.current = false
    }
  }, [])

  async function addPasskey() {
    setAdding(true)
    try {
      const result = await authClient.passkey.addPasskey({})
      if (result?.error) {
        const cancelled =
          "code" in result.error &&
          result.error.code === "ERROR_CEREMONY_ABORTED"
        if (!cancelled)
          toast.add({
            type: "error",
            title: "Could not add the passkey",
            description: result.error.message,
          })
        return
      }
      if (await loadPasskeys()) {
        toast.add({ type: "success", title: "Passkey added" })
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not add the passkey",
        description: errorMessage(error),
      })
    } finally {
      if (mountedRef.current) setAdding(false)
    }
  }

  async function deletePasskey(passkey: Passkey) {
    setBusyId(passkey.id)
    try {
      const { error } = await authClient.passkey.deletePasskey({
        id: passkey.id,
      })
      if (error) {
        toast.add({
          type: "error",
          title: "Could not remove the passkey",
          description: error.message,
        })
        return
      }
      if (await loadPasskeys()) {
        toast.add({ type: "success", title: "Passkey removed" })
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not remove the passkey",
        description: errorMessage(error),
      })
    } finally {
      if (mountedRef.current) setBusyId(null)
    }
  }

  async function renamePasskey(name: string) {
    if (!renaming) return
    const passkey = renaming
    setBusyId(passkey.id)
    setRenaming(null)
    try {
      const { error } = await authClient.passkey.updatePasskey({
        id: passkey.id,
        name,
      })
      if (error) {
        toast.add({
          type: "error",
          title: "Could not rename the passkey",
          description: error.message,
        })
        return
      }
      if (await loadPasskeys()) {
        toast.add({ type: "success", title: "Passkey renamed" })
      }
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not rename the passkey",
        description: errorMessage(error),
      })
    } finally {
      if (mountedRef.current) setBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SettingsHeading
        title="Passkeys"
        description="Passkeys are a secure way to sign in to your Numa account"
      />
      <SettingsRows>
        {loading ? (
          <>
            <SettingsRow>
              <ItemContent className="gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-52" />
              </ItemContent>
              <Skeleton className="h-8 w-24" />
            </SettingsRow>
            <SettingsRow>
              <Skeleton className="size-8 rounded-lg" />
              <ItemContent className="gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-44" />
              </ItemContent>
            </SettingsRow>
          </>
        ) : loadError ? (
          <SettingsRow>
            <ItemContent>
              <ItemTitle>Could not load passkeys</ItemTitle>
              <ItemDescription>{loadError}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadPasskeys()}
              >
                Retry
              </Button>
            </ItemActions>
          </SettingsRow>
        ) : (
          <>
            <SettingsRow>
              <ItemContent>
                <ItemTitle>
                  {passkeys.length === 0
                    ? "No passkeys registered"
                    : passkeys.length === 1
                      ? "1 passkey"
                      : `${passkeys.length} passkeys`}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <Button variant="ghost" disabled={adding} onClick={addPasskey}>
                  {adding && <Spinner />}New passkey
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
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
                          strokeWidth={2}
                        />
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
          </>
        )}
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
