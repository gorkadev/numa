"use client"

import { useState, useTransition, type FormEvent } from "react"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

import { Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { Spinner } from "@/components/localized-spinner"
import { deleteGame, renameGame } from "@/lib/games/actions"

/** Matches `TITLE_MAX_LENGTH`, so the field stops where the action truncates. */
const TITLE_MAX_LENGTH = 60

/**
 * The rename and delete confirmations of one game, opened by whoever holds
 * their state: the game's overflow menu and the command palette.
 *
 * Both confirm in different components on purpose: renaming asks for a value,
 * so it is a `Dialog` around a form, while deleting only asks for a yes and is
 * irreversible, so it is an `AlertDialog` — which traps focus on its own
 * buttons and cannot be dismissed by clicking away.
 *
 * The open state lives with the caller because neither opener outlives the
 * click: a menu item unmounts with its menu and a palette item with the
 * palette, taking any dialog rendered inside them along. The caller renders
 * this as a sibling, so the click only flips state that survives.
 */
export function GameActionDialogs({
  gameId,
  title,
  renameOpen,
  onRenameOpenChange,
  deleteOpen,
  onDeleteOpenChange,
}: {
  gameId: string
  title: string
  renameOpen: boolean
  onRenameOpenChange: (open: boolean) => void
  deleteOpen: boolean
  onDeleteOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("GameMenu")
  const common = useTranslations("Common")

  /**
   * Whether these dialogs belong to the game currently on screen, which is the
   * only thing deletion needs to know: the same dialogs can delete a game the
   * user is not looking at, and that must not navigate.
   */
  const pathname = usePathname()
  const viewing = pathname === `/games/${gameId}`

  /**
   * The field is controlled and seeded each time the dialog opens, rather than
   * uncontrolled with a `defaultValue`. A default is read once, at mount, and
   * this dialog is reopened against a title that has since changed — so the
   * second rename would start from the name the first one replaced.
   */
  const [name, setName] = useState(title)
  const [renaming, startRenaming] = useTransition()
  const [renameError, setRenameError] = useState<string | null>(null)

  const [deleting, startDeleting] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  /** Seeding during render on the open edge, the way React's docs adjust state on a prop change. */
  const [seededRename, setSeededRename] = useState(renameOpen)
  if (renameOpen !== seededRename) {
    setSeededRename(renameOpen)
    if (renameOpen) {
      setName(title)
      setRenameError(null)
    }
  }

  const [seededDelete, setSeededDelete] = useState(deleteOpen)
  if (deleteOpen !== seededDelete) {
    setSeededDelete(deleteOpen)
    if (deleteOpen) setDeleteError(null)
  }

  /**
   * Submitted through a handler rather than through `<form action>`, because
   * closing is part of the outcome: the dialog has to stay open on a failure
   * to have somewhere to put the message, and only the resolved action knows
   * which of the two happened.
   */
  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setRenameError(null)

    startRenaming(async () => {
      const result = await renameGame(gameId, name)

      if (result?.error) {
        setRenameError(result.error)
        return
      }

      onRenameOpenChange(false)
    })
  }

  /**
   * Only a failure ever lands here: deleting the game on screen redirects away
   * instead of returning, and deleting any other one leaves its row to
   * disappear from under it. The transition is what keeps the button disabled
   * while the sandbox is being torn down.
   */
  function confirmDelete() {
    setDeleteError(null)

    startDeleting(async () => {
      const result = await deleteGame(gameId, { viewing })

      if (result?.error) setDeleteError(result.error)
    })
  }

  return (
    <>
      <Dialog open={renameOpen} onOpenChange={onRenameOpenChange}>
        <DialogContent closeLabel={common("close")}>
          <form onSubmit={submitRename} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>{t("renameTitle")}</DialogTitle>
              <DialogDescription>{t("renameDescription")}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor="game-title">{t("name")}</Label>
              <Input
                id="game-title"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={TITLE_MAX_LENGTH}
                autoFocus
                required
                aria-invalid={renameError !== null || undefined}
              />
              {renameError ? (
                <p className="text-xs text-destructive">{renameError}</p>
              ) : null}
            </div>

            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" disabled={renaming} />}
              >
                {t("cancel")}
              </DialogClose>
              <Button type="submit" disabled={renaming || !name.trim()}>
                {renaming ? <Spinner /> : null}
                {renaming ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { title })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("cancel")}
            </AlertDialogCancel>
            {/**
             * Not an `AlertDialogCancel`: the dialog has to stay open while the
             * sandbox is being destroyed, both to hold the pending state and to
             * be somewhere for a failure to appear. Success needs no close —
             * the dialog goes away with the page or with the row.
             */}
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? <Spinner /> : null}
              {deleting ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
