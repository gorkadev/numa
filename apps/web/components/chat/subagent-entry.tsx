"use client"

import {
  Alert01Icon,
  MinusSignCircleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@workspace/ui/components/marker"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import type {
  SubagentRunRecord,
  SubagentRunStatus,
} from "@/lib/games/harness/records"

/**
 * Plain-text status for everywhere a finished (or not-yet-started) run's
 * status appears without the shimmer treatment (design.md decision 16).
 * `"running"` never reaches this: a running record shows its `activity`
 * one-liner instead, both here and in `SubagentPanel`'s run list.
 */
export function subagentStatusLabel(status: SubagentRunStatus): string {
  switch (status) {
    case "done":
      return "Done"
    case "partial":
      return "Stopped partway"
    case "blocked":
      return "Needs input"
    case "error":
      return "Failed"
    case "aborted":
      return "Cancelled"
    case "skipped":
      return "Skipped"
    case "unavailable":
      return "Unavailable"
    case "running":
      return "Running"
  }
}

/** A tick only for `"done"`: a cancelled, partial or blocked run must not read as a success. */
function statusIcon(status: SubagentRunStatus) {
  if (status === "done") return Tick02Icon
  if (status === "error") return Alert01Icon
  return MinusSignCircleIcon
}

export type SubagentEntryProps = {
  record: SubagentRunRecord
  /**
   * Opens the panel on this run. Takes only the `agentId`, not an
   * open/selection pair, so 10b can lift `{ open, selectedRunId }` in
   * `chat-thread.tsx`/`game-chat.tsx` and pass one callback down to every
   * inline entry in the thread.
   */
  onSelect: (agentId: string) => void
}

/**
 * One inline "a sub-agent is working / worked" line inside an assistant
 * message (`subagent-view`'s Inline Entry Shimmers While Running and
 * Sub-Agents Are Presented as Named Bots requirements). `displayName ·
 * activity` while the run is in progress, using the same `shimmer` class
 * `tool-group.tsx`'s `ToolGroup` and `thinking.tsx`'s `Thinking` apply to
 * `MarkerContent` for other in-progress work; `displayName · status` in
 * plain text once the run has a terminal status.
 *
 * Errors get the same destructive tint `tool-group.tsx`'s `ToolMarker` uses
 * for a failed tool call — the one status a reader should never mistake for
 * "it worked".
 */
export function SubagentEntry({ record, onSelect }: SubagentEntryProps) {
  const running = record.status === "running"
  const errored = record.status === "error"

  return (
    <Marker
      render={<button type="button" />}
      className={cn(
        "w-auto cursor-pointer ps-[13px] hover:text-foreground",
        errored && "text-destructive"
      )}
      onClick={() => onSelect(record.agentId)}
    >
      <MarkerIcon>
        {running ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={statusIcon(record.status)} strokeWidth={2} />
        )}
      </MarkerIcon>
      <MarkerContent className={running ? "shimmer" : undefined}>
        {record.displayName} ·{" "}
        {running ? record.activity : subagentStatusLabel(record.status)}
      </MarkerContent>
    </Marker>
  )
}
