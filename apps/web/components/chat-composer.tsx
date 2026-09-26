"use client"

import { useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent, ReactNode } from "react"
import { useTranslations } from "next-intl"
import { ArrowUp02Icon, Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { Spinner } from "@/components/localized-spinner"
import { ModelPicker } from "@/components/model-picker"
import type { TierId } from "@/lib/ai/model-catalog"

type SpeechRecognitionResultLike = {
  isFinal: boolean
  [index: number]: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type RecognitionSession = {
  recognition: SpeechRecognitionLike
  active: boolean
  finalResultIndexes: Set<number>
}

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
   * The selected tier, and the way to change it. Both are passed straight
   * through to the picker — the composer is presentational, so the tier is
   * the caller's state for the same reason the text is.
   *
   * Optional together: a composer whose caller has nowhere to send the choice
   * shows no picker rather than a control that decides nothing.
   */
  tierId?: TierId
  onTierChange?: (tierId: TierId) => void
  /**
   * Rendered directly above the `InputGroup`, visually merged into it (the
   * caller decides whether to render anything at all — this component stays
   * presentational and owns no task-list state or derivation of its own).
   * `task-strip.tsx`'s `TaskStrip` is the one caller today: it rounds its own
   * top corners to match `InputGroup`'s, and `InputGroup` squares its top
   * corners in turn whenever this is present, so the two read as one card.
   */
  tasksSlot?: ReactNode
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
  placeholder,
  tierId,
  onTierChange,
  tasksSlot,
}: ChatComposerProps) {
  const t = useTranslations("GameComposer")
  const [recognitionSupported, setRecognitionSupported] = useState<boolean | null>(null)
  const [listening, setListening] = useState(false)
  const [dictationStatus, setDictationStatus] = useState("")
  const draftRef = useRef(value)
  const sessionRef = useRef<RecognitionSession | null>(null)
  const mountedRef = useRef(false)
  const trimmed = value.trim()

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      const session = sessionRef.current
      sessionRef.current = null
      if (session) {
        session.active = false
        session.recognition.abort()
      }
    }
  }, [])

  useEffect(() => {
    draftRef.current = value
  }, [value])

  function stopDictation() {
    const session = sessionRef.current
    if (!session) return

    session.active = false
    sessionRef.current = null
    setListening(false)
    setDictationStatus(t("dictationStopped"))
    try {
      session.recognition.stop()
    } catch {
      // The session is already inactive; a late stop error cannot restore it.
    }
  }

  function startDictation() {
    if (sessionRef.current) return

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setRecognitionSupported(false)
      setDictationStatus(t("dictationUnavailable"))
      return
    }

    setRecognitionSupported(true)

    try {
      const recognition = new Recognition()
      const session: RecognitionSession = {
        recognition,
        active: true,
        finalResultIndexes: new Set(),
      }
      const isCurrentSession = () =>
        mountedRef.current && session.active && sessionRef.current === session

      recognition.lang = document.documentElement.lang || "en"
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onstart = () => {
        if (!isCurrentSession()) return
        setListening(true)
        setDictationStatus(t("dictationListening"))
      }
      recognition.onresult = (event) => {
        if (!isCurrentSession()) return

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (!result || !result.isFinal || session.finalResultIndexes.has(index)) continue

          session.finalResultIndexes.add(index)
          const transcript = result[0]?.transcript
          if (!transcript) continue

          const currentDraft = draftRef.current
          const separator = currentDraft && !/\s$/.test(currentDraft) ? " " : ""
          const nextDraft = `${currentDraft}${separator}${transcript}`
          draftRef.current = nextDraft
          onValueChange(nextDraft)
        }
      }
      recognition.onerror = (event) => {
        if (!isCurrentSession()) return

        session.active = false
        sessionRef.current = null
        setListening(false)
        setDictationStatus(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? t("dictationPermissionError")
            : event.error === "audio-capture"
              ? t("dictationMicrophoneError")
              : t("dictationError")
        )
      }
      recognition.onend = () => {
        if (!isCurrentSession()) return

        session.active = false
        sessionRef.current = null
        setListening(false)
        setDictationStatus(t("dictationStopped"))
      }

      sessionRef.current = session
      setListening(true)
      setDictationStatus(t("dictationStarting"))
      recognition.start()
    } catch {
      const session = sessionRef.current
      if (session) session.active = false
      sessionRef.current = null
      setListening(false)
      setDictationStatus(t("dictationError"))
    }
  }
  const stoppable = pending && Boolean(onStop)

  function submit() {
    if (pending || !trimmed) return

    stopDictation()
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
      <div className="flex w-full flex-col">
        {tasksSlot}
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
            placeholder={placeholder ?? t("placeholder")}
            onChange={(event) => {
              const nextValue = event.target.value
              draftRef.current = nextValue
              onValueChange(nextValue)
            }}
            onKeyDown={handleKeyDown}
          />
          <InputGroupAddon align="block-end">
            {tierId && onTierChange ? (
              <ModelPicker value={tierId} onValueChange={onTierChange} />
            ) : null}
            <InputGroupButton
              type="button"
              onClick={() => (sessionRef.current ? stopDictation() : startDictation())}
              aria-label={listening ? t("stopDictation") : t("startDictation")}
              disabled={recognitionSupported === false || pending}
              aria-pressed={listening}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon icon={Mic01Icon} />
            </InputGroupButton>
            {/**
             * One button, two meanings: while an answer streams it stops the
             * turn instead of sending it. It switches to `type="button"` so
             * the click cancels rather than resubmitting the form.
             */}
            <InputGroupButton
              type={stoppable ? "button" : "submit"}
              onClick={stoppable ? onStop : undefined}
              aria-label={stoppable ? t("stopGenerating") : t("sendMessage")}
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
        {dictationStatus || recognitionSupported === false ? (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground mt-2">
            {dictationStatus || t("dictationUnavailable")}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
      </div>
    </form>
  )
}
