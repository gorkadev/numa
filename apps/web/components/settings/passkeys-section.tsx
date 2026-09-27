"use client"

import { useEffect, useRef, useState } from "react"
import { FingerPrintIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { getAuthenticatorName } from "@better-auth/passkey"
import { useFormatter, useTranslations } from "next-intl"
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
import { toast } from "@workspace/ui/components/toast"

import { Spinner } from "@/components/localized-spinner"

import { authClient } from "@/lib/auth-client"
import {
  SettingsHeading,
  SettingsRow,
  SettingsRows,
} from "@/components/settings/settings-group"

type Passkey = NonNullable<
  Awaited<ReturnType<typeof authClient.passkey.listUserPasskeys>>["data"]
>[number]

function passkeyLabel(passkey: Passkey, fallback: string) {
  return passkey.name || getAuthenticatorName(passkey.aaguid) || fallback
}

export function PasskeysSection() {
  const t = useTranslations("Settings")
  const format = useFormatter()
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
        setLoadError(t("genericError"))
        return false
      }
      setPasskeys(data ?? [])
      return true
    } catch {
      if (mountedRef.current && id === requestId.current) {
        setLoadError(t("genericError"))
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
            title: t("couldNotAddPasskey"),
            description: t("genericError"),
          })
        return
      }
      if (await loadPasskeys()) {
        toast.add({ type: "success", title: t("passkeyAdded") })
      }
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotAddPasskey"),
        description: t("genericError"),
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
          title: t("couldNotRemovePasskey"),
          description: t("genericError"),
        })
        return
      }
      if (await loadPasskeys()) {
        toast.add({ type: "success", title: t("passkeyRemoved") })
      }
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotRemovePasskey"),
        description: t("genericError"),
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
          title: t("couldNotRenamePasskey"),
          description: t("genericError"),
        })
        return
      }
      if (await loadPasskeys()) {
        toast.add({ type: "success", title: t("passkeyRenamed") })
      }
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotRenamePasskey"),
        description: t("genericError"),
      })
    } finally {
      if (mountedRef.current) setBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SettingsHeading
        title={t("passkeys")}
        description={t("passkeysDescription")}
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
              <ItemTitle>{t("couldNotLoadPasskeys")}</ItemTitle>
              <ItemDescription>{loadError}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadPasskeys()}
              >
                {t("retry")}
              </Button>
            </ItemActions>
          </SettingsRow>
        ) : (
          <>
            <SettingsRow>
              <ItemContent>
                <ItemTitle>{t("passkeyCount", { count: passkeys.length })}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Button variant="ghost" disabled={adding} onClick={addPasskey}>
                  {adding && <Spinner />}{t("newPasskey")}
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
                  <ItemTitle>{passkeyLabel(passkey, t("passkeys"))}</ItemTitle>
                  <ItemDescription>
                    {t("addedAt", { time: format.relativeTime(new Date(passkey.createdAt)) })}
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
                            aria-label={t("managePasskey", { name: passkeyLabel(passkey, t("passkeys")) })}
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
                          {t("rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deletePasskey(passkey)}
                        >
                          {t("removePasskey")}
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
  const t = useTranslations("Settings")
  const common = useTranslations("Common")
  return (
    <Dialog open={passkey !== null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={common("close")} className="sm:max-w-sm">
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
            <DialogTitle>{t("renamePasskey")}</DialogTitle>
            <DialogDescription>
              {t("renamePasskeyDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="passkey-name">{t("name")}</Label>
            <Input
              key={passkey?.id}
              id="passkey-name"
              name="name"
              autoFocus
              required
              maxLength={64}
              aria-label={t("name")}
              defaultValue={passkey ? passkeyLabel(passkey, t("passkeys")) : ""}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
