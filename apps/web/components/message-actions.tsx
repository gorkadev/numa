"use client"

import { useEffect, useRef, useState } from "react"

import { getToolName, isToolUIPart, type UIMessage } from "ai"
import {
  Copy01Icon,
  MoreHorizontalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { MessageFooter } from "@workspace/ui/components/message"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { readMessageMeta } from "@/lib/ai/message-meta"
import {
  formatMessageTime,
  formatMessageTimeLong,
} from "@/lib/format/message-time"

/**
 * The row under a message: copy it, see when it was sent, and — for a reply —
 * open what the turn actually did.
 *
 * Hidden until the message is hovered or something in the row takes focus.
 * A thread is read far more often than it is acted on, and three controls
 * repeated under every bubble turn a conversation into a toolbar. The
 * information stays available and stops competing with the reading.
 *
 * `has-data-[popup-open]` keeps the row up while the popover is open, because
 * moving the pointer into a portalled panel leaves the message's hover behind
 * and would otherwise pull the trigger out from under it.
 */
export function MessageActions({ message }: { message: UIMessage }) {
  const meta = readMessageMeta(message)
  const text = messageText(message)
  const tools = message.parts.filter(isToolUIPart)
  const details = tools.length > 0 || meta.tokens !== undefined

  if (!text && !details && meta.sentAt === undefined) return null

  return (
    <MessageFooter className="gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100 has-data-[popup-open]:opacity-100">
      {text ? <CopyButton text={text} /> : null}
      {details ? <DetailsButton message={message} /> : null}
      {meta.sentAt !== undefined ? <SentAt at={meta.sentAt} /> : null}
    </MessageFooter>
  )
}

/**
 * Everything the message said, as the reader would paste it.
 *
 * Text parts only — a tool call is something the agent did, not something it
 * wrote, and pasting "read_file src/game.js" into a note is never what the
 * copy button was pressed for.
 */
function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim()
}

const COPIED_FOR = 2000

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  /**
   * The timer is cleared on unmount and before it is replaced. A thread
   * re-renders constantly while a turn streams, and a stray timeout would set
   * state on a message the reader has already scrolled past.
   */
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /**
       * The clipboard is refused outright in an insecure context and by some
       * permission settings. Nothing here can recover from that, and an error
       * toast for a copy the reader can still do by hand is noise — so the
       * button simply does not flip to its confirmed state.
       */
      return
    }

    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR)
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copied ? "Copied" : "Copy message"}
            onClick={copy}
            className="text-muted-foreground"
          />
        }
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          strokeWidth={2}
        />
      </TooltipTrigger>
      <TooltipContent>
        <span className="text-[13px] font-medium">
          {copied ? "Copied" : "Copy"}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * When the message was sent, short in the row and complete on hover.
 *
 * `suppressHydrationWarning` because this is formatted in the reader's
 * timezone and the server has no idea what that is: the same instant is
 * legitimately two different strings on the two renders. The alternative —
 * withholding the time until after mount — would leave the row a pixel
 * narrower on first paint for no gain.
 */
function SentAt({ at }: { at: number }) {
  const date = new Date(at)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={date.toISOString()}
            className="cursor-default p-1.5 font-normal tabular-nums"
            suppressHydrationWarning
          />
        }
      >
        {formatMessageTime(date)}
      </TooltipTrigger>
      <TooltipContent>
        <span className="text-[13px] font-medium" suppressHydrationWarning>
          {formatMessageTimeLong(date)}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The turn's receipt, behind a three-dot trigger.
 *
 * A popover rather than more text in the row, because none of this is read on
 * the way past — it is looked up, once, when the reader wonders why a turn was
 * slow or expensive. Putting a token count under every reply would price a
 * conversation the player is trying to have.
 */
function DetailsButton({ message }: { message: UIMessage }) {
  const meta = readMessageMeta(message)
  const tools = toolTally(message)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Turn details"
            className="text-muted-foreground"
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
      </PopoverTrigger>
      <PopoverContent align="start" className="gap-3">
        {meta.tokens ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              Tokens
            </h3>
            <dl className="flex flex-col gap-1 text-xs bg-muted p-3 rounded-2xl">
              <Stat label="Input" value={meta.tokens.input} />
              {meta.tokens.cached > 0 ? (
                <Stat label="Cached" value={meta.tokens.cached} />
              ) : null}
              <Stat label="Output" value={meta.tokens.output} />
              {meta.tokens.reasoning > 0 ? (
                <Stat label="Reasoning" value={meta.tokens.reasoning} />
              ) : null}
              {meta.credits !== undefined ? (
                <Stat
                  label="Credits"
                  value={meta.credits}
                  className="border-t border-border pt-1 font-medium text-foreground"
                />
              ) : null}
            </dl>
          </section>
        ) : null}
        {tools.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">Tools</h3>
            <dl className="flex flex-col gap-1 text-xs bg-muted p-3 rounded-2xl">
              {tools.map(({ name, count }) => (
                <Stat key={name} label={toolNoun(name)} value={count} />
              ))}
            </dl>
          </section>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 text-muted-foreground ${className ?? ""}`}
    >
      <dt className="min-w-0 truncate">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value.toLocaleString("en-US")}</dd>
    </div>
  )
}

/**
 * The tools this message used, counted by name and kept in the order they were
 * first called — the order they happened in, which is the only ordering a
 * reader can check against what they watched.
 */
function toolTally(message: UIMessage): { name: string; count: number }[] {
  const tally = new Map<string, number>()

  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue

    const name = getToolName(part)

    tally.set(name, (tally.get(name) ?? 0) + 1)
  }

  return [...tally].map(([name, count]) => ({ name, count }))
}

/**
 * A tool's name as a thing, not as an action.
 *
 * Deliberately a second map rather than a reuse of `TOOL_LABELS` in
 * `chat-thread.tsx`: that one is a pair of verbs for a live status line
 * ("Reading src/game.js"), and this is a row in a tally where the count
 * supplies the number and the label has to read as a noun.
 */
const TOOL_NOUNS: Record<string, string> = {
  ask_player: "Questions asked",
  read_file: "Files read",
  list_files: "Listings",
  write_file: "Files written",
  replace_text: "Edits",
  delete_file: "Files deleted",
}

function toolNoun(name: string): string {
  return TOOL_NOUNS[name] ?? name
}
