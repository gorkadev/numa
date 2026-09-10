"use client"

import type { FormEvent, KeyboardEvent } from "react"
import { ArrowUp02Icon, StopIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { Spinner } from "@workspace/ui/components/spinner"

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

  function submit() {
    if (pending || !trimmed) return

    onSubmit(trimmed)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    submit()
  }

  /**
   * Enter sends, Shift+Enter writes a new line — the convention every chat the
   * player has used already follows, and the composer is a message box before
   * it is a form.
   *
   * `isComposing` is the load-bearing part: while an IME candidate window is
   * open, Enter commits the candidate rather than the message. Without the
   * guard, writing anything in Japanese, Chinese or Korean would fire a send on
   * the first accepted word.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return
    if (event.nativeEvent.isComposing) return

    event.preventDefault()

    submit()
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col">
      <div className="flex w-full flex-col gap-2">
        <InputGroup>
          {/**
           * The control grows with what is typed — `field-sizing-content` on
           * the base textarea — so it needs a ceiling of its own, or a message
           * of a few paragraphs pushes the composer past the viewport and
           * takes the send button with it. Past the cap the textarea scrolls
           * internally instead, which keeps the whole message readable without
           * the layout moving.
           */}
          <InputGroupTextarea
            className="max-h-48 resize-none overflow-y-auto py-3"
            name="prompt"
            rows={3}
            value={value}
            disabled={pending}
            placeholder={placeholder}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
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
              variant={stoppable ? "destructive" : "default"}
              size="icon-sm"
            >
              {stoppable ? (
                <HugeiconsIcon icon={StopIcon} />
              ) : pending ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={ArrowUp02Icon} />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  )
}
