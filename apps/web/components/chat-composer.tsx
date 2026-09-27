"use client"

import {
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { useTranslations } from "next-intl"
import {
  ArrowUp02Icon,
  AudioWave01FreeIcons,
  Cancel01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { LiveWaveform } from "@workspace/ui/components/live-waveform"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useComposerShortcuts } from "@/components/chat/use-composer-shortcuts"
import { useSpeechDictation } from "@/components/chat/use-speech-dictation"
import { useIsMac } from "@/hooks/use-is-mac"
import { Spinner } from "@/components/localized-spinner"
import { ModelPicker } from "@/components/model-picker"
import type { TierId } from "@/lib/ai/model-catalog"

type ChatComposerProps = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (value: string) => void
  /** Cancels an answer in flight; without it, pending shows a spinner. */
  onStop?: () => void
  pending?: boolean
  error?: string | null
  placeholder?: string
  tierId?: TierId
  onTierChange?: (tierId: TierId) => void
  /** Optional content visually merged above the input group. */
  tasksSlot?: ReactNode
}

/** Shared controlled composer for the home screen and active chat thread. */
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
  const isMac = useIsMac()
  const dictationHint = isMac ? "⌃⇧D" : "Ctrl ⇧ D"
  const dictation = useSpeechDictation(value, onValueChange)
  const {
    phase,
    status,
    supported,
    waveformFailed,
    waveformError,
    start,
    stop,
    discard,
    active,
    hasSession,
    setDraft,
  } = dictation
  const [modelOpen, setModelOpen] = useState(false)
  const pickerAvailable = Boolean(tierId && onTierChange && !active)

  useComposerShortcuts({
    phase, supported, pending, modelOpen, pickerAvailable,
    start, stop, discard, setModelOpen,
  })

  const trimmed = value.trim()
  const stoppable = pending && Boolean(onStop)

  function submit() {
    if (pending || active || hasSession() || !trimmed) return
    onSubmit(trimmed)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return
    event.preventDefault()
    submit()
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col">
      <div className="flex w-full flex-col">
        {tasksSlot}
        <InputGroup>
          <InputGroupTextarea
            className="max-h-48 resize-none overflow-y-auto py-3"
            name="prompt"
            rows={3}
            value={value}
            disabled={pending || active}
            placeholder={placeholder ?? t("placeholder")}
            onChange={(event) => {
              const next = event.target.value
              setDraft(next)
              onValueChange(next)
            }}
            onKeyDown={handleKeyDown}
          />
          <InputGroupAddon align="block-end" className="justify-start">
            {!active && tierId && onTierChange ? (
              <ModelPicker
                value={tierId}
                onValueChange={onTierChange}
                open={modelOpen}
                onOpenChange={setModelOpen}
              />
            ) : null}
            {active ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger render={
                    <InputGroupButton
                      type="button"
                      onClick={discard}
                      aria-keyshortcuts="Escape"
                      aria-label={t("discardDictation")}
                      size="icon-sm"
                      variant="ghost"
                      className="shrink-0"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} />
                    </InputGroupButton>
                  } />
                  <TooltipContent>{t("discardDictation")} <Kbd>Esc</Kbd></TooltipContent>
                </Tooltip>
                {waveformFailed ? (
                  <div
                    className="min-w-0 flex-1 border-b border-dotted border-muted-foreground/40"
                    aria-hidden="true"
                  />
                ) : (
                  <LiveWaveform
                    className="min-w-0 flex-1"
                    height={32}
                    mode="scrolling"
                    active={phase === "recording"}
                    processing={phase === "finishing"}
                    onError={waveformError}
                    aria-label={status}
                    fadeEdges={true}
                  />
                )}
                <Tooltip>
                  <TooltipTrigger render={
                    <InputGroupButton
                      type="button"
                      onClick={stop}
                      aria-keyshortcuts={phase === "recording" ? "Control+Shift+D" : undefined}
                      aria-label={t("stopDictation")}
                      disabled={phase === "finishing"}
                      size="icon-sm"
                      variant="ghost"
                      className="shrink-0"
                    >
                      <HugeiconsIcon icon={StopIcon} />
                    </InputGroupButton>
                  } />
                  <TooltipContent>{t("stopDictation")} <Kbd>{dictationHint}</Kbd></TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger render={
                  <InputGroupButton
                    type="button"
                    onClick={start}
                    aria-keyshortcuts={supported !== false && !pending ? "Control+Shift+D" : undefined}
                    aria-label={t("startDictation")}
                    disabled={supported === false || pending}
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto"
                  >
                    <HugeiconsIcon icon={AudioWave01FreeIcons} />
                  </InputGroupButton>
                } />
                <TooltipContent>{t("startDictation")} <Kbd>{dictationHint}</Kbd></TooltipContent>
              </Tooltip>
            )}
            <InputGroupButton
              type={stoppable ? "button" : "submit"}
              onClick={stoppable ? onStop : undefined}
              aria-label={stoppable ? t("stopGenerating") : t("sendMessage")}
              disabled={active || (stoppable ? false : pending || !trimmed)}
              className="shrink-0 rounded-full"
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
        {status || supported === false ? (
          <span role="status" aria-live="polite" className="sr-only">
            {status || t("dictationUnavailable")}
            {waveformFailed ? ` ${t("dictationWaveformUnavailable")}` : ""}
          </span>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </form>
  )
}
