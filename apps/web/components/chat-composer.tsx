"use client"

import type { FormEvent } from "react"
import {
  ArrowDown01Icon,
  ArrowUp02Icon,
  GridIcon,
  Loading03Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"

type ChatComposerProps = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (value: string) => void
  /**
   * Cancels the answer in flight. Passing it turns the submit button into a
   * stop button while `pending`; leaving it out keeps the button a spinner,
   * which is what a composer with nothing to cancel — the home screen's game
   * creation — should show.
   */
  onStop?: () => void
  pending?: boolean
  error?: string | null
  placeholder?: string
}

/**
 * Presentational composer: it owns no state and no transport. Every caller
 * decides what submitting means — creating a game, sending a message — so the
 * same UI can sit on the empty home screen and inside an open thread.
 */
export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  pending = false,
  error = null,
  placeholder = "Describe the game you want to build…",
}: ChatComposerProps) {
  const trimmed = value.trim()
  const stoppable = pending && Boolean(onStop)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (pending || !trimmed) return

    onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col">
      <div className="flex w-full flex-col gap-2">
        <InputGroup>
          <InputGroupTextarea
            name="prompt"
            rows={3}
            value={value}
            disabled={pending}
            placeholder={placeholder}
            onChange={(event) => onValueChange(event.target.value)}
          />
          <InputGroupAddon align="block-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton type="button">
                    <HugeiconsIcon icon={GridIcon} />
                    Kimi K3
                    <HugeiconsIcon icon={ArrowDown01Icon} />
                  </InputGroupButton>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem>Kimi K3</DropdownMenuItem>
                <DropdownMenuItem>Claude Opus 5</DropdownMenuItem>
                <DropdownMenuItem>GPT-5</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/**
             * One button, two meanings: while an answer streams it stops the
             * turn instead of sending it. It switches to `type="button"` so
             * the click cancels rather than resubmitting the form.
             */}
            <InputGroupButton
              type={stoppable ? "button" : "submit"}
              onClick={stoppable ? onStop : undefined}
              aria-label={stoppable ? "Stop generating" : "Send message"}
              disabled={stoppable ? false : pending || !trimmed}
              className="ml-auto rounded-full"
              variant="default"
              size="icon-sm"
            >
              <HugeiconsIcon
                icon={
                  stoppable
                    ? StopIcon
                    : pending
                      ? Loading03Icon
                      : ArrowUp02Icon
                }
                className={!stoppable && pending ? "animate-spin" : undefined}
              />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  )
}
