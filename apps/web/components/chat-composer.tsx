"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { useFormatter, useTranslations } from "next-intl"
import {
  ArrowUp02Icon,
  AudioWave01FreeIcons,
  Cancel01Icon,
  File01Icon,
  MagicWand01Icon,
  Pdf01Icon,
  PlusSignIcon,
  StopIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { FileUIPart } from "ai"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@workspace/ui/components/input-group"
import { LiveWaveform } from "@workspace/ui/components/live-waveform"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@workspace/ui/components/attachment"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { EditorContent } from "@tiptap/react"
import { useComposerAttachments } from "@/components/chat/use-composer-attachments"
import { useComposerEditor } from "@/components/chat/use-composer-editor"
import { useComposerShortcuts } from "@/components/chat/use-composer-shortcuts"
import { useFileMentions, type MentionFilesLoader } from "@/components/chat/use-file-mentions"
import { usePromptImprover } from "@/components/chat/use-prompt-improver"
import { useSpeechDictation } from "@/components/chat/use-speech-dictation"
import { useIsMac } from "@/hooks/use-is-mac"
import { Spinner } from "@/components/localized-spinner"
import { ModelPicker } from "@/components/model-picker"
import { LockedTemplate, TemplatePicker } from "@/components/template-picker"
import type { TierId } from "@/lib/ai/model-catalog"
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_COUNT } from "@/lib/games/attachments"
import { canImprove, improverTooltip } from "@/lib/games/improver/allowance"
import type { ImproverMode } from "@/lib/games/improver/instructions"
import type { TemplateId } from "@/lib/games/templates/catalog"

type ChatComposerProps = {
  value: string
  onValueChange: (value: string) => void
  /** The trimmed text, and the files attached to it when `attachable`. */
  onSubmit: (value: string, files: FileUIPart[]) => void
  /** Cancels an answer in flight; without it, pending shows a spinner. */
  onStop?: () => void
  pending?: boolean
  error?: string | null
  placeholder?: string
  tierId?: TierId
  onTierChange?: (tierId: TierId) => void
  /**
   * The game's template. With `onTemplateChange` it is a choice made before
   * creating the game; without it, it is an existing game's template, shown
   * read-only because it is immutable after creation.
   */
  templateId?: TemplateId
  onTemplateChange?: (templateId: TemplateId) => void
  /**
   * Focuses the text area on mount and again whenever it is re-enabled after a
   * turn, so the screen can be typed into without reaching for the mouse.
   */
  autoFocus?: boolean
  /**
   * Rendered directly above the `InputGroup`, visually merged into it (the
   * caller decides whether to render anything at all — this component stays
   * presentational and owns no task-list state or derivation of its own).
   * `task-strip.tsx`'s `TaskStrip` is the one caller today: it rounds its own
   * top corners to match `InputGroup`'s, and `InputGroup` squares its top
   * corners in turn whenever this is present, so the two read as one card.
   */
  tasksSlot?: ReactNode
  /**
   * Rendered directly below the `InputGroup`. Opt-in for the same reason as
   * `tasksSlot`: the new-game screen shares this composer and has no chat to
   * report on, so it simply never passes one.
   */
  usageSlot?: ReactNode
  /**
   * Turns on the prompt improver: `new` rewrites the prompt that starts a
   * game, `change` a change request inside one. Without it, no button and no
   * allowance request.
   */
  improverMode?: ImproverMode
  /**
   * Turns on `@` file mentions: typing `@` lists the game's files and the one
   * chosen is written into the message as its path. Without it, `@` is text.
   */
  loadMentionFiles?: MentionFilesLoader
  /** Opens a mentioned file in the side panel when its chip is clicked. */
  onOpenFile?: (path: string) => void
  /**
   * Turns on attachments: a + button opens the system file picker, and the
   * files picked are uploaded and sent with the message, as context for the
   * model only.
   */
  attachable?: boolean
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
  templateId,
  onTemplateChange,
  autoFocus = false,
  tasksSlot,
  usageSlot,
  improverMode,
  loadMentionFiles,
  onOpenFile,
  attachable = false,
}: ChatComposerProps) {
  const t = useTranslations("GameComposer")
  const format = useFormatter()
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
  const [templateOpen, setTemplateOpen] = useState(false)
  const templatePickerAvailable = Boolean(templateId && onTemplateChange && !active && !pending)
  const pickerAvailable = Boolean(tierId && onTierChange && !active)


  /**
   * Programmatic writes go through the same two calls as typing does, so
   * dictation's draft never falls behind the text it would append to.
   */
  function replaceValue(next: string) {
    setDraft(next)
    onValueChange(next)
  }

  const improver = usePromptImprover({
    mode: improverMode,
    value,
    setValue: replaceValue,
    templateId: templateId ?? "none",
  })

  /**
   * An improvement in flight counts as pending for the shortcuts too: a
   * dictation started mid-call would be overwritten by the improved text.
   */
  useComposerShortcuts({
    phase, supported, pending: pending || improver.improving, modelOpen, pickerAvailable,
    templatePickerAvailable, start, stop, discard, setModelOpen, setTemplateOpen,
  })

  const files = useComposerAttachments()
  const fileInput = useRef<HTMLInputElement>(null)

  const mentionListId = useId()
  const textareaDisabled = pending || active || improver.improving
  const mentions = useFileMentions(loadMentionFiles, mentionListId)
  const editor = useComposerEditor({
    value,
    onValueChange: replaceValue,
    onSubmit: submit,
    placeholder: placeholder ?? t("placeholder"),
    disabled: textareaDisabled,
    suggestion: mentions.suggestion,
    knownPaths: mentions.files,
    onOpenFile,
  })

  /**
   * An effect rather than the `autoFocus` attribute, which only fires on mount:
   * the text area is disabled while a turn runs, and a disabled control drops
   * focus, so it has to be taken back once the turn ends. Arriving through a
   * link leaves focus on that link, so focus is taken from anything except
   * another text field or an open dialog or menu. Never on touch screens, where
   * focusing would throw the on-screen keyboard over the page.
   */
  useEffect(() => {
    if (!autoFocus || textareaDisabled) return
    if (!window.matchMedia("(pointer: fine)").matches) return
    const focused = document.activeElement
    if (
      focused instanceof HTMLElement &&
      (focused.isContentEditable ||
        focused.matches("input, textarea, select") ||
        focused.closest('[role="dialog"], [role="menu"]'))
    )
      return
    editor?.commands.focus("end")
  }, [autoFocus, textareaDisabled, editor])

  const trimmed = value.trim()
  const stoppable = pending && Boolean(onStop)

  /** The limit is always on show: remaining uses, the charge, or the reset. */
  function improverTooltipText() {
    if (!improver.allowance) return t("improvePrompt")
    const { key, values, resetsAt } = improverTooltip(improver.allowance)
    return t(key, {
      ...values,
      time: resetsAt
        ? format.dateTime(new Date(resetsAt), { hour: "2-digit", minute: "2-digit" })
        : "",
    })
  }

  /** A file still on its way would be left out of the message, so sending waits for it. */
  function submit() {
    if (pending || active || improver.improving || hasSession() || !trimmed || files.uploading) return
    onSubmit(trimmed, files.parts)
    files.clear()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit()
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col">
      <div className="flex w-full flex-col">
        {tasksSlot}
        <InputGroup>
          {attachable ? (
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                if (event.target.files) files.add(event.target.files)
                event.target.value = ""
              }}
            />
          ) : null}
          {files.attachments.length > 0 ? (
            <InputGroupAddon align="block-start" className="pb-0">
              <AttachmentGroup className="w-full">
                {files.attachments.map((item) => (
                  <Attachment key={item.id} size="sm" state={item.state === "uploading" ? "uploading" : item.state}>
                    <AttachmentMedia variant={item.preview ? "image" : "icon"}>
                      {item.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a local object URL
                        <img src={item.preview} alt="" />
                      ) : item.state === "uploading" ? (
                        <Spinner />
                      ) : (
                        <HugeiconsIcon icon={item.mediaType === "application/pdf" ? Pdf01Icon : File01Icon} />
                      )}
                    </AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{item.name}</AttachmentTitle>
                      {item.problem ? (
                        <AttachmentDescription>
                          {t(`attachmentProblem.${item.problem}`, {
                            size: Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024),
                          })}
                        </AttachmentDescription>
                      ) : null}
                    </AttachmentContent>
                    <AttachmentActions>
                      <AttachmentAction
                        aria-label={t("removeAttachment", { name: item.name })}
                        onClick={() => files.remove(item.id)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} />
                      </AttachmentAction>
                    </AttachmentActions>
                  </Attachment>
                ))}
              </AttachmentGroup>
            </InputGroupAddon>
          ) : null}
          {/**
           * The editor only exists after hydration, so the wrapper holds the
           * text area's resting height meanwhile and the composer does not
           * grow under the reader on load.
           */}
          <EditorContent
            editor={editor}
            data-slot="composer-editor"
            className="flex min-h-16 w-full min-w-0 flex-1 flex-col"
          />
          {mentions.open ? (
            <div
              data-slot="mention-list"
              /**
               * Opens over the `@` itself, on whichever line it was typed, and
               * is pulled back left only as far as it takes to stay inside the
               * composer.
               */
              style={{
                top: mentions.anchor.top,
                left: `min(${mentions.anchor.left}px, calc(100% - min(26rem, 100%)))`,
              }}
              className="absolute z-50 flex max-h-72 w-[min(26rem,100%)] -translate-y-[calc(100%+0.5rem)] flex-col overflow-hidden rounded-2xl bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10"
            >
              {mentions.matches.length > 0 ? (
                <ul
                  id={mentionListId}
                  role="listbox"
                  aria-label={t("mentionFiles")}
                  className="no-scrollbar min-h-0 scroll-fade overflow-y-auto overscroll-contain"
                >
                  {mentions.matches.map((path, index) => {
                    const slash = path.lastIndexOf("/")
                    const name = path.slice(slash + 1)
                    const hit = mentions.query ? name.toLowerCase().indexOf(mentions.query.toLowerCase()) : -1
                    return (
                      <li
                        key={path}
                        id={`${mentionListId}-${index}`}
                        role="option"
                        aria-selected={index === mentions.index}
                        /** Keeps focus in the text area, which a click would take. */
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => mentions.highlightAt(index)}
                        onClick={() => mentions.choose(path)}
                        className="flex cursor-default scroll-my-8 items-center gap-2 rounded-xl px-2.5 py-1.5 aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                        <span className="shrink-0">
                          {hit === -1 ? (
                            name
                          ) : (
                            <>
                              {name.slice(0, hit)}
                              <strong className="font-semibold">
                                {name.slice(hit, hit + mentions.query.length)}
                              </strong>
                              {name.slice(hit + mentions.query.length)}
                            </>
                          )}
                        </span>
                        {slash !== -1 ? (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {path.slice(0, slash)}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-2.5 py-1.5 text-muted-foreground">
                  {mentions.loading ? t("mentionLoading") : t("mentionEmpty")}
                </p>
              )}
            </div>
          ) : null}
          <InputGroupAddon align="block-end" className="justify-start">
            {attachable && !active ? (
              <Tooltip>
                <TooltipTrigger render={
                  <InputGroupButton
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    aria-label={t("attachFiles")}
                    disabled={pending || files.full}
                    focusableWhenDisabled
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 data-disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={PlusSignIcon} />
                  </InputGroupButton>
                } />
                <TooltipContent>
                  {files.full ? t("attachmentsFull", { count: ATTACHMENT_MAX_COUNT }) : t("attachFiles")}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {!active && tierId && onTierChange ? (
              <ModelPicker
                value={tierId}
                onValueChange={onTierChange}
                open={modelOpen}
                onOpenChange={setModelOpen}
              />
            ) : null}
            {!active && templateId && onTemplateChange ? (
              <TemplatePicker
                value={templateId}
                onValueChange={onTemplateChange}
                open={templateOpen}
                onOpenChange={setTemplateOpen}
                disabled={pending}
              />
            ) : null}
            {!active && templateId && templateId !== "none" && !onTemplateChange ? (
              <LockedTemplate value={templateId} />
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
              <div className="ml-auto flex items-center gap-1">
              {improver.enabled ? (
                <Tooltip>
                  <TooltipTrigger render={
                    <InputGroupButton
                      type="button"
                      onClick={improver.canUndo ? improver.restore : improver.improve}
                      aria-label={improver.canUndo ? t("undoImprove") : t("improvePrompt")}
                      disabled={
                        pending ||
                        improver.improving ||
                        (!improver.canUndo &&
                          (!trimmed || !improver.allowance || !canImprove(improver.allowance)))
                      }
                      /**
                       * Still hoverable while disabled, so the tooltip can
                       * say why: Free, the quota spent, or no balance.
                       */
                      focusableWhenDisabled
                      size="icon-sm"
                      variant="ghost"
                      className="data-disabled:opacity-50"
                    >
                      {improver.improving ? (
                        <Spinner />
                      ) : (
                        <HugeiconsIcon icon={improver.canUndo ? Undo02Icon : MagicWand01Icon} />
                      )}
                    </InputGroupButton>
                  } />
                  <TooltipContent>
                    {improver.canUndo ? t("undoImprove") : improverTooltipText()}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger render={
                  <InputGroupButton
                    type="button"
                    onClick={start}
                    aria-keyshortcuts={supported !== false && !pending ? "Control+Shift+D" : undefined}
                    aria-label={t("startDictation")}
                    disabled={supported === false || pending || improver.improving}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={AudioWave01FreeIcons} />
                  </InputGroupButton>
                } />
                <TooltipContent>{t("startDictation")} <Kbd>{dictationHint}</Kbd></TooltipContent>
              </Tooltip>
              </div>
            )}
            <InputGroupButton
              type={stoppable ? "button" : "submit"}
              onClick={stoppable ? onStop : undefined}
              aria-label={stoppable ? t("stopGenerating") : t("sendMessage")}
              disabled={active || (stoppable ? false : pending || improver.improving || !trimmed || files.uploading)}
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
        {usageSlot}
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
