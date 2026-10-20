"use client"

import { useState } from "react"

import { getToolName } from "ai"
import { useTranslations } from "next-intl"
import { Alert01Icon, CircleCheckIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@workspace/ui/components/trace"
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@workspace/ui/components/marker"
import { cn } from "@workspace/ui/lib/utils"

import { Spinner } from "@/components/localized-spinner"

import {
  TOOL_LABELS,
  isSettled,
  toolError,
  toolLabel,
  toolPath,
  type ToolPart,
} from "@/lib/games/tool-parts"

import { groupState, resolveGroupOpen, stepStatus } from "./tool-group-state"

const TOOL_TRANSLATION_KEYS = {
  ask_player: "ask_player",
  read_file: "read_file",
  list_files: "list_files",
  write_file: "write_file",
  replace_text: "replace_text",
  delete_file: "delete_file",
  explore: "explore",
  plan: "plan",
  run_tasks: "run_tasks",
  verify: "verify",
  submit_plan: "submit_plan",
  load_skill: "load_skill",
} as const

export function ToolGroup({ parts }: { parts: ToolPart[] }) {
  const t = useTranslations("ChatActivity")
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const { count, failed, running, status } = groupState(parts)

  if (parts.length === 1 && parts[0]) {
    return <ToolMarker part={parts[0]} className="ps-[13px]" />
  }

  return (
    <Trace className="ps-[13px]">
      <TraceCollapsible
        open={resolveGroupOpen(manualOpen, running)}
        onOpenChange={setManualOpen}
      >
        <TraceCollapsibleTrigger>
          <TraceLine status={status}>
            <TraceIcon>
              <ActivityIcon status={status} />
            </TraceIcon>
            <TraceTitle>
              {t(running ? "toolGroupRunning" : "toolGroupFinished", { count })}
              {failed > 0 ? `, ${t("toolGroupFailed", { failed })}` : null}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace role="list">
            {parts.map((part) => {
              const label = localizedToolLabel(part, t)
              const status = stepStatus(part)
              // Labels already include the full safe input path. Repeating it
              // in a disclosure would add no detail; never expose raw payloads.
              return (
                <TraceLine
                  key={part.toolCallId}
                  role="listitem"
                  status={status}
                >
                  <TraceIcon>
                    <ActivityIcon status={status} />
                  </TraceIcon>
                  <TraceTitle>{label}</TraceTitle>
                </TraceLine>
              )
            })}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

function ActivityIcon({ status }: { status: "running" | "error" | undefined }) {
  if (status === "running") return <Spinner />
  return (
    <HugeiconsIcon
      icon={status === "error" ? Alert01Icon : CircleCheckIcon}
      strokeWidth={2}
    />
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
  const t = useTranslations("ChatActivity")
  const error = toolError(part)
  const settled = isSettled(part)
  const label = localizedToolLabel(part, t)

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
          <HugeiconsIcon icon={CircleCheckIcon} strokeWidth={2} />
        ) : (
          <Spinner />
        )}
      </MarkerIcon>
      <MarkerContent>{label}</MarkerContent>
    </Marker>
  )
}

function localizedToolLabel(
  part: ToolPart,
  t: ReturnType<typeof useTranslations<"ChatActivity">>
): string {
  const phase =
    toolError(part) !== null ? "failed" : isSettled(part) ? "done" : "active"
  const label = localizedToolCallLabel(
    getToolName(part),
    toolPath(part.input),
    phase,
    t
  )

  return label ?? toolLabel(part)
}

/** Localized display-only label for a known call; callers keep unknown fallbacks unchanged. */
export function localizedToolCallLabel(
  name: string,
  path: string | null | undefined,
  phase: "active" | "done" | "failed",
  t: ReturnType<typeof useTranslations<"ChatActivity">>
): string | null {
  const translationKey =
    TOOL_TRANSLATION_KEYS[name as keyof typeof TOOL_TRANSLATION_KEYS]

  if (!translationKey || !TOOL_LABELS[name]) return null

  return t(
    `toolLabels.${translationKey}.${phase}` as never,
    { path: path ? ` ${path}` : "" } as never
  )
}
