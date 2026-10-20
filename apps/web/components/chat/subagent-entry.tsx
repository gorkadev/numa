"use client"

import {
  Alert01Icon,
  MinusSignCircleIcon,
  CircleCheckIcon,
} from "@hugeicons/core-free-icons"
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
import { localizedToolCallLabel } from "@/components/chat/tool-group"

import { Spinner } from "@/components/localized-spinner"
import { AgentBot } from "@/components/chat/agent-bot"

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
export function subagentStatusKey(
  status: SubagentRunStatus
): `status${Capitalize<SubagentRunStatus>}` {
  switch (status) {
    case "done":
      return "statusDone"
    case "partial":
      return "statusPartial"
    case "blocked":
      return "statusBlocked"
    case "error":
      return "statusError"
    case "aborted":
      return "statusAborted"
    case "skipped":
      return "statusSkipped"
    case "unavailable":
      return "statusUnavailable"
    case "running":
      return "statusRunning"
  }
}

/** A tick only for `"done"`: a cancelled, partial or blocked run must not read as a success. */
function statusIcon(status: SubagentRunStatus) {
  if (status === "done") return CircleCheckIcon
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

/** Recorded calls are bounded history, not a reconstruction of live activity. */
export function SubagentEntry({ record, onSelect }: SubagentEntryProps) {
  const t = useTranslations("ChatAgents")
  const activityT = useTranslations("ChatActivity")
  const running = record.status === "running"
  // Initialize once: streamed updates must not undo the reader's choice.
  const [open, setOpen] = useState(running)
  const role = t(`roles.${record.role}.name`)
  const activity = record.activity
  const title = running
    ? activity === "starting" ||
      activity === "thinking" ||
      activity === "stopping"
      ? t(`trace.${activity}`, { role })
      : t("trace.running", { role, activity: activity || t("trace.working") })
    : t(`trace.${record.status}`, { role })
  const report =
    ["done", "partial", "blocked"].includes(record.status) &&
    record.summary.trim()

  return (
    <Trace className="ps-[13px]">
      <TraceCollapsible open={open} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine
            status={
              running
                ? "running"
                : record.status === "error"
                  ? "error"
                  : undefined
            }
          >
            <TraceIcon>
              {running ? (
                <Spinner />
              ) : (
                <HugeiconsIcon
                  icon={statusIcon(record.status)}
                  strokeWidth={2}
                />
              )}
            </TraceIcon>
            <AgentBot role={record.role} status={record.status} size={24} />
            <TraceTitle>{title}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace role="list">
            {record.toolCalls.map((call) => (
              <TraceLine
                key={call.toolCallId}
                role="listitem"
                status={call.ok ? undefined : "error"}
              >
                <TraceIcon>
                  <HugeiconsIcon
                    icon={call.ok ? CircleCheckIcon : Alert01Icon}
                    strokeWidth={2}
                  />
                </TraceIcon>
                <TraceTitle>
                  {localizedToolCallLabel(
                    call.toolName,
                    call.path,
                    call.ok ? "done" : "failed",
                    activityT
                  ) ??
                    t(call.ok ? "trace.callDone" : "trace.callFailed", {
                      path: call.path ? ` ${call.path}` : "",
                    })}
                </TraceTitle>
              </TraceLine>
            ))}
          </Trace>
          {record.toolCalls.length === 0 && (
            <p className="text-sm">{t("trace.empty")}</p>
          )}
          {report && (
            <Trace className="mt-2">
              <TraceCollapsible defaultOpen={false}>
                <TraceCollapsibleTrigger>
                  <TraceLine>
                    <TraceTitle>{t("trace.report")}</TraceTitle>
                  </TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent keepMounted>
                  <Markdown>{record.summary}</Markdown>
                </TraceCollapsibleContent>
              </TraceCollapsible>
            </Trace>
          )}
          <button
            type="button"
            className="mt-2 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
            onClick={() => onSelect(record.agentId)}
          >
            {t("trace.details")}
          </button>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
