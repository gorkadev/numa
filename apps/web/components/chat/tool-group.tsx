"use client"

import { useState } from "react"

import { getToolName } from "ai"
import {
  Alert01Icon,
  ArrowDown01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@workspace/ui/components/marker"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import {
  MUTATING_TOOLS,
  isSettled,
  toolError,
  toolLabel,
  type ToolPart,
} from "@/lib/games/tool-parts"

/**
 * A run of tool calls, as one line the reader can open.
 *
 * Collapsed by default once it is done, because a finished group is a fact
 * about the past — "it read nine files" — and the reply underneath is what the
 * player actually wants. Open it and every call is there, unchanged.
 *
 * While the group is still running the header shows the call in flight rather
 * than a count, so the thread reports what is happening now instead of how
 * much has happened so far.
 *
 * A group that contains a failure says so in the header and tints itself,
 * because that is the one thing summarising must never bury: a turn that
 * failed halfway looks identical to a turn that worked, once you have replaced
 * its steps with a number.
 */
export function ToolGroup({ parts }: { parts: ToolPart[] }) {
  const [open, setOpen] = useState(false)

  const active = parts.find((part) => !isSettled(part))
  const failed = parts.filter((part) => toolError(part) !== null).length

  /**
   * One call is not a group. Summarising it would replace a line that says
   * what happened with a line that says how many things happened, and the
   * answer would always be one.
   */
  if (parts.length === 1 && parts[0]) {
    return <ToolMarker part={parts[0]} className="ps-[13px]" />
  }

  const label = active
    ? toolLabel(active)
    : `${parts.some((part) => MUTATING_TOOLS.has(getToolName(part))) ? "Edited" : "Read"} ${parts.length} files`

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        /**
         * A real `<button>` underneath, not a clickable div: the trigger
         * assumes a native button (`nativeButton` defaults true) and leaves
         * keyboard handling to it, so rendering `Marker`'s default `div` here
         * would produce a control the keyboard cannot reach.
         *
         * `ps-[13px]` lines the icon up with a bubble's text: `BubbleContent`
         * sits its text at `px-3` (12px) plus its 1px transparent border, and
         * a marker with no padding of its own otherwise starts flush at 0 —
         * one pixel off from `px-3` alone, which is why this is the arbitrary
         * value rather than the utility.
         */
        render={
          <Marker
            render={<button type="button" />}
            className={cn(
              "w-auto cursor-pointer ps-[13px] hover:text-foreground",
              failed > 0 && "text-destructive"
            )}
          />
        }
      >
        <MarkerIcon>
          {active ? (
            <Spinner />
          ) : failed > 0 ? (
            <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
          )}
        </MarkerIcon>
        <MarkerContent className={active ? "shimmer" : undefined}>
          {label}
          {!active && failed > 0 ? `, ${failed} failed` : null}
        </MarkerContent>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="ms-auto shrink-0 transition-transform group-data-[panel-open]/marker:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-col gap-1 border-s border-border ps-3">
        {parts.map((part) => (
          <ToolMarker key={part.toolCallId} part={part} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * One line of "here is what I am doing to your game".
 *
 * Collapses the SDK's seven tool-call states into the three the user cares
 * about: it is happening, it worked, it did not. The states beyond those —
 * approval requested, responded, denied — cannot occur here because no tool is
 * configured to require approval, but they resolve rather than crash if that
 * ever changes.
 */
export function ToolMarker({
  part,
  className,
}: {
  part: ToolPart
  /**
   * Only ever passed by `ToolGroup`'s single-call case, to bring a
   * standalone marker up to the same `ps-[13px]` inset as a multi-call
   * group's header. A marker nested inside the collapsible list already gets
   * its indent from that list's own `ps-3`, so applying it here too would
   * double it.
   */
  className?: string
}) {
  const error = toolError(part)
  const settled = isSettled(part)
  const label = toolLabel(part)

  if (error) {
    return (
      /**
       * The message goes in `title` rather than on screen. It is written for
       * the model to recover from — "that text appears 3 times" — and the user
       * cannot act on it, so the line stays short and the detail stays one
       * hover away.
       */
      <Marker className={cn("text-destructive", className)} title={error}>
        <MarkerIcon>
          <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
        </MarkerIcon>
        <MarkerContent>{label}</MarkerContent>
      </Marker>
    )
  }

  return (
    <Marker className={className} aria-live={settled ? undefined : "polite"}>
      <MarkerIcon>
        {settled ? (
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
        ) : (
          <Spinner />
        )}
      </MarkerIcon>
      <MarkerContent>{label}</MarkerContent>
    </Marker>
  )
}
