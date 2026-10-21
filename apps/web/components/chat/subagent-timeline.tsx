"use client"

import { Alert01Icon, CircleCheckIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslations } from "next-intl"

import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@workspace/ui/components/trace"
import { Markdown } from "@/components/chat/markdown"
import { ReasoningBlock } from "@/components/chat/reasoning-block"
import { localizedToolCallLabel } from "@/components/chat/tool-group"

import type { SubagentTimelineEntry } from "@/lib/games/harness/records"

export type SubagentTimelineProps = {
  entries: readonly SubagentTimelineEntry[]
  /**
   * The run's own live flag. It gates the one entry that can still be open —
   * see the reasoning branch below — and nothing else: everything here is a
   * static render of what has already happened.
   */
  running: boolean
}

/**
 * What a run actually did, in arrival order: its thinking, the text it wrote
 * and the calls it settled, interleaved the way they happened.
 *
 * A static render on purpose. This is history, not activity: there is no
 * `MessageScroller`, no auto-scroll and no per-token insertion, because the
 * whole timeline is replaced by the next persisted snapshot rather than
 * appended to in place. The only thing that is not settled is the trailing
 * entry of a run that is still going.
 *
 * Each kind borrows the treatment the thread already gives it instead of
 * getting a second one:
 *
 * - `reasoning` is `ReasoningBlock` with a one-part array. That block's unit
 *   is a run of consecutive reasoning parts; a timeline entry already IS one
 *   such run (`narration.ts` coalesces them), so the call site adapts the
 *   array and the component keeps its meaning.
 * - `text` is the same `Markdown` the reply body uses, for the same reason:
 *   the model writes Markdown and printing it raw shows the asterisks.
 * - `tool` is the line `SubagentEntry` already drew, label and status
 *   included. The entry's `error` stays out of the UI, as it always has.
 *
 * No `role="list"` here, unlike the tool-only list this replaces: a list of
 * prose blocks and disclosures is not a list of items. The legacy list keeps
 * its own semantics untouched.
 */
export function SubagentTimeline({ entries, running }: SubagentTimelineProps) {
  const t = useTranslations("ChatAgents")
  const activityT = useTranslations("ChatActivity")

  // Nothing to wrap: an empty shell would be an empty box on screen.
  if (entries.length === 0) return null

  return (
    <Trace data-slot="subagent-timeline">
      {entries.map((entry, index) => {
        /**
         * Index keys are the honest ones here: the array is a snapshot that is
         * replaced wholesale on every update, never reordered or spliced in
         * the middle, so an entry's position IS its identity.
         */
        const key = `${entry.kind}-${index}`

        if (entry.kind === "reasoning") {
          /**
           * Only the LAST entry can still be arriving. Every earlier one has
           * been followed by something else, so it is finished even while the
           * run is not.
           */
          const streaming = running && index === entries.length - 1

          return (
            <ReasoningBlock
              key={key}
              parts={[
                {
                  type: "reasoning",
                  text: entry.text,
                  state: streaming ? "streaming" : "done",
                },
              ]}
              streaming={running}
            />
          )
        }

        if (entry.kind === "text") {
          return (
            /**
             * Indented like the reasoning block, so prose and thinking line up
             * instead of the text starting under the icons.
             */
            <div key={key} className="w-full min-w-0 ps-[13px] wrap-break-word">
              <Markdown>{entry.text}</Markdown>
            </div>
          )
        }

        return (
          <TraceLine key={key} status={entry.ok ? undefined : "error"}>
            <TraceIcon>
              <HugeiconsIcon
                icon={entry.ok ? CircleCheckIcon : Alert01Icon}
                strokeWidth={2}
              />
            </TraceIcon>
            <TraceTitle>
              {localizedToolCallLabel(
                entry.toolName,
                entry.path,
                entry.ok ? "done" : "failed",
                activityT
              ) ??
                t(entry.ok ? "trace.callDone" : "trace.callFailed", {
                  path: entry.path ? ` ${entry.path}` : "",
                })}
            </TraceTitle>
          </TraceLine>
        )
      })}
    </Trace>
  )
}
