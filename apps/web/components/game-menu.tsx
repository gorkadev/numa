"use client"

import { useState, useTransition, type FormEvent } from "react"

import { usePathname } from "next/navigation"

import {
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Spinner } from "@workspace/ui/components/spinner"

import { deleteGame, renameGame } from "@/lib/games/actions"

/** Matches `TITLE_MAX_LENGTH`, so the field stops where the action truncates. */
const TITLE_MAX_LENGTH = 60

/**
 * The game's own actions, as an overflow menu.
 *
 * Both confirm before they run, and they confirm in different components on
 * purpose: renaming asks for a value, so it is a `Dialog` around a form, while
 * deleting only asks for a yes and is irreversible, so it is an `AlertDialog` —
 * which traps focus on its own buttons and cannot be dismissed by clicking
 * away.
 *
 * The two dialogs are siblings of the menu rather than children of its items.
 * A menu item unmounts with the menu the moment it is clicked, taking any
 * dialog rendered inside it along; hoisting them here means the click only has
 * to flip a piece of state that outlives the menu.
 */
export function GameMenu({
  gameId,
  title,
  trigger,
}: {
  gameId: string
  title: string
  /**
   * Replaces the control that opens the menu, for a caller whose layout owns
   * what it should look like — the sidebar's rows position theirs themselves.
   * Left out, it is the icon button the game page's header wants.
   */
  trigger?: React.ComponentProps<typeof DropdownMenuTrigger>["render"]
}) {
  /**
   * Whether this menu belongs to the game currently on screen, which is the
   * only thing deletion needs to know: from the sidebar the same menu can
   * delete a game the user is not looking at, and that must not navigate.
   */
  const pathname = usePathname()
  const viewing = pathname === `/games/${gameId}`

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  /**
   * The field is controlled and seeded when the dialog opens, rather than
   * uncontrolled with a `defaultValue`. A default is read once, at mount, and
   * this dialog is reopened against a title that has since changed — so the
   * second rename would start from the name the first one replaced.
   */
  const [name, setName] = useState(title)

  const [renaming, startRenaming] = useTransition()
  const [renameError, setRenameError] = useState<string | null>(null)

  const [deleting, startDeleting] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function openRename() {
    setName(title)
    setRenameError(null)
    setRenameOpen(true)
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

      setRenameOpen(false)
    })
  }

  function openDelete() {
    setDeleteError(null)
    setDeleteOpen(true)
  }

  /**
   * Only a failure ever lands here: deleting the game on screen redirects away
   * instead of returning, and deleting any other one leaves this menu's own
   * row to disappear from under it. The transition is what keeps the button
   * disabled while the sandbox is being torn down.
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={trigger ?? <Button variant="ghost" size="icon-sm" />}
          aria-label="Game options"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={openRename}>
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={openDelete}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={submitRename} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Rename game</DialogTitle>
              <DialogDescription>
                This is the name the sidebar and this header show.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor="game-title">Name</Label>
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
                Cancel
              </DialogClose>
              <Button type="submit" disabled={renaming || !name.trim()}>
                {renaming ? <Spinner /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this game?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}” and its conversation are deleted, and the sandbox
              running the game is destroyed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
