"use client"

import type { FormEvent } from "react"
import {
  ArrowUp02Icon,
  Loading03Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"

import { ModelPicker } from "@/components/model-picker"
import type { GameModelId } from "@/lib/ai/model-catalog"

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
  /**
   * The selected model, and the way to change it. Both are passed straight
   * through to the picker — the composer is presentational, so the model is
   * the caller's state for the same reason the text is.
   *
   * Optional together: a composer whose caller has nowhere to send the choice
   * shows no picker rather than a control that decides nothing.
   */
  modelId?: GameModelId
  onModelChange?: (modelId: GameModelId) => void
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
  modelId,
  onModelChange,
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
            {modelId && onModelChange ? (
              <ModelPicker value={modelId} onValueChange={onModelChange} />
            ) : null}
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
                  stoppable ? StopIcon : pending ? Loading03Icon : ArrowUp02Icon
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
