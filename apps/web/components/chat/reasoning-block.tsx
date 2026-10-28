"use client"

import { CircleCheckIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@workspace/ui/components/trace"

import { Markdown } from "@/components/chat/markdown"
import { Spinner } from "@/components/localized-spinner"

import type { ReasoningUIPart } from "ai"

export type ReasoningBlockProps = {
  /** One run of consecutive reasoning parts, in arrival order. */
  parts: ReasoningUIPart[]
  /**
   * The run's own live flag, straight from the thread. A part's `state` alone
   * cannot answer "is this still happening?" — see the `running` calculation
   * below.
   */
  streaming: boolean
}

/**
 * The agent's thinking, as it streams.
 *
 * A `Trace` with one line per reasoning part: the model can think in several
 * stanzas, and each one is its own disclosure. Nothing here is timed — the SDK
 * does not measure reasoning, and inventing a duration would be a number the
 * reader cannot check.
 */
export function ReasoningBlock({ parts, streaming }: ReasoningBlockProps) {
  return (
    <Trace className="ps-[13px]">
      {parts.map((part, index) => (
        <ReasoningLine
          // Position, not `part.id`: providers can repeat an id across steps.
          key={`reasoning-${index}`}
          text={part.text}
          /**
           * Two sources, both required. An aborted stream never emits
           * `reasoning-end`, so the persisted part keeps `state: "streaming"`
           * forever and would spin here — including after a reload. The run's
           * flag is what actually ends, so it gates the part rather than
           * replacing it: a part that already finished stays finished while
           * its run keeps streaming.
           */
          running={streaming && part.state === "streaming"}
        />
      ))}
    </Trace>
  )
}

function ReasoningLine({ text, running }: { text: string; running: boolean }) {
  const t = useTranslations("ChatMessages")
  // Left undefined until the reader acts, so `open ?? running` follows the
  // stream first and the reader's own toggle wins from then on.
  const [open, setOpen] = useState<boolean>()

  const line = (
    <TraceLine status={running ? "running" : undefined}>
      <TraceIcon>
        {running ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={CircleCheckIcon} strokeWidth={2} />
        )}
      </TraceIcon>
      <TraceTitle>
        {t(running ? "reasoningRunning" : "reasoningFinished")}
      </TraceTitle>
    </TraceLine>
  )

  /**
   * No text yet means there is nothing to open, and an empty disclosure reads
   * as a bug. Whitespace counts as no text: trimming here is what keeps a
   * part that streamed only newlines from opening a blank panel.
   */
  if (text.trim().length === 0) return line

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      {/*
        The model writes Markdown here — bold lead-ins, lists, the occasional
        heading. Rendering it as raw text showed the asterisks, so this uses
        the same safe renderer as the reply body.
      */}
      <TraceCollapsibleContent>
        <Markdown>{text}</Markdown>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
