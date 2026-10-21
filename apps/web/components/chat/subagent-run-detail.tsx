"use client"

import { useEffect, useRef, useState } from "react"

import {
  Alert01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useLocale, useTranslations } from "next-intl"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { Markdown } from "@/components/chat/markdown"
import { AgentBot } from "@/components/chat/agent-bot"
import { presentRunModel } from "@/components/chat/agent-run-presentation"
import { subagentStatusKey } from "@/components/chat/subagent-entry"
import { SubagentTimeline } from "@/components/chat/subagent-timeline"
import { localizedToolCallLabel } from "@/components/chat/tool-group"
import type { SubagentRunRecord } from "@/lib/games/harness/records"
import { describeToolCall } from "@/lib/games/tool-parts"

export type SubagentRunDetailProps = {
  record: SubagentRunRecord
}

/** `max-h-40` below, in pixels — the height `ExpandableText` clamps to and the threshold it compares against to decide whether a "Show more" toggle is even needed. */
const CLAMP_HEIGHT_PX = 160

/**
 * A muted text block that clamps to a fixed height, with a "Show more"/"Show
 * less" toggle that only appears when the text actually overflows that clamp.
 *
 * Deliberately does not use `CollapsibleContent`: Base UI's `Panel` unmounts
 * (or hides) its children while closed, which would remove the clamped
 * preview along with the rest of the text instead of merely capping its
 * height. `Collapsible`/`CollapsibleTrigger` are used only for the toggle's
 * own open state and accessibility wiring — the clamp itself is a plain class
 * driven directly off that state.
 *
 * Overflow is measured against a fixed pixel threshold rather than against
 * the element's own `clientHeight`: `clientHeight` reads as the CLAMPED
 * height while collapsed and the FULL height once expanded, so comparing
 * `scrollHeight` to it would answer "does this need a toggle" differently
 * depending on the toggle's own current state — including making the toggle
 * disappear the moment it is expanded. `scrollHeight` alone stays the
 * content's true full height in either state, so it is what gets compared.
 */
function ExpandableText({ text }: { text: string }) {
  const t = useTranslations("ChatAgents")
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = textRef.current
    if (!node) return

    const checkOverflow = () => setOverflows(node.scrollHeight > CLAMP_HEIGHT_PX)
    checkOverflow()

    const observer = new ResizeObserver(checkOverflow)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Bubble variant="muted" className="w-full max-w-full">
        {/**
         * The toggle sits inside the box, under the text it controls, so the
         * box reads as one unit rather than a block with a stray button
         * hanging off it.
         */}
        <BubbleContent className="flex w-full flex-col items-start gap-1">
          {/**
           * Rendered through the thread's own `Markdown`: both sides of a run
           * are model-facing markdown (a worker's prompt opens with a
           * `## Task:` heading, and its reply is written the way any agent
           * reply is), so printing them raw showed the syntax instead of
           * the formatting — the same gap the thread itself once had.
           */}
          <div
            ref={textRef}
            className={cn(
              "w-full min-w-0 wrap-break-word",
              !open && "max-h-40 overflow-hidden",
              // Only fade a text that is actually cut: a short one would lose its last lines to the gradient.
              !open &&
                overflows &&
                "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
            )}
          >
            <Markdown>{text}</Markdown>
          </div>
          {overflows ? (
            <CollapsibleTrigger
              render={
                <Button variant="ghost" size="sm" className="-ms-2.5">
                  {open ? t("showLess") : t("showMore")}
                  <HugeiconsIcon
                    icon={open ? ArrowUp01Icon : ArrowDown01Icon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </Button>
              }
            />
          ) : null}
        </BubbleContent>
      </Bubble>
    </Collapsible>
  )
}

/**
 * Full detail for one sub-agent run, shown inside `SubagentPanel` once a run
 * is selected (`subagent-view`'s Sub-Agent Runs Are Openable From the Thread
 * and Sub-Agents Are Presented as Named Bots requirements — the concrete
 * model belongs here, not on the inline entry or the run list).
 *
 * Purely props-driven: there is no internal state to go stale. A caller
 * re-rendering this component with a newer `record` — the next throttled
 * snapshot `run-subagent.ts` yields (design.md decision 5) — is the entire
 * "keeps updating while it runs" behavior the spec asks for.
 *
 * The body follows the run's own order: metadata, the input, what the run
 * actually did (the same `SubagentTimeline` the inline entry renders), the
 * files it touched, and the report LAST. The token footer closes the panel
 * because it is metadata, not content.
 */
export function SubagentRunDetail({ record }: SubagentRunDetailProps) {
  const t = useTranslations("ChatAgents")
  const activityT = useTranslations("ChatActivity")
  const locale = useLocale()
  const running = record.status === "running"
  const model = presentRunModel(record)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-2">
        <AgentBot role={record.role} status={record.status} size={40} />
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            {t(`roles.${record.role}.name`)}
          </h3>
          <p className="text-xs text-muted-foreground">{t(`roles.${record.role}.specialty`)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("tierLabel")}</span>
        <span>{t(`tiers.${record.tier}`)}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("statusLabel")}</span>
        <span className={running ? "shimmer" : undefined}>
          {running ? record.activity : t(subagentStatusKey(record.status))}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("modelLabel")}</span>
        <span>{model.modelName || t("metadataUnavailable")}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("effortLabel")}</span>
        <span>{model.effort ? t(`efforts.${model.effort}`) : t("metadataUnavailable")}</span>
      </div>

      {/**
       * `record.prompt` defaults to `""` for a record persisted before this
       * field existed (`records.ts`'s own `.default("")` note) — hidden
       * rather than shown empty, since "no input recorded" and "the input
       * was blank" are not the same thing worth surfacing the same way.
       */}
      {record.prompt ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("inputLabel")}</span>
          <ExpandableText text={record.prompt} />
        </div>
      ) : null}

      {/** A hidden input would otherwise leave its separator behind. */}
      {record.prompt ? <Separator /> : null}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          {/**
           * The timeline IS the call list, so a record that has one drops the
           * separate `Tool calls` section entirely instead of listing every
           * call a second time. A record written before the timeline existed
           * has `timeline: []` and a populated `toolCalls`, and keeps the old
           * section unchanged — the same fallback rule the inline entry uses.
           */}
          {record.timeline.length > 0
            ? t("traceLabel")
            : t("toolCallsLabel", { count: record.toolCalls.length })}
        </span>
        {record.timeline.length > 0 ? (
          <SubagentTimeline entries={record.timeline} running={running} />
        ) : record.toolCalls.length === 0 ? (
          <p className="text-muted-foreground">{t("emptyToolCalls")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {record.toolCalls.map((call) => (
              <li key={call.toolCallId} className="flex items-start gap-2">
                <HugeiconsIcon
                  icon={call.ok ? Tick02Icon : Alert01Icon}
                  strokeWidth={2}
                  className={cn(
                    "mt-0.5 size-4 shrink-0 text-muted-foreground",
                    !call.ok && "text-destructive"
                  )}
                />
                {/**
                 * The error text goes in `title`, the same place
                 * `tool-group.tsx`'s `ToolMarker` puts it: written for
                 * recovery, not for the player to act on, so it stays one
                 * hover away rather than always on screen.
                 */}
                <span
                  className={!call.ok ? "text-destructive" : undefined}
                  title={call.error}
                >
                  {localizedToolCallLabel(
                    call.toolName,
                    call.path,
                    call.ok ? "done" : "failed",
                    activityT
                  ) ??
                    describeToolCall(
                      call.toolName,
                      call.path,
                      call.ok ? "done" : "failed"
                    )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">
          {t("editedFilesLabel", { count: record.edits.length })}
        </span>
        {record.edits.length === 0 ? (
          <p className="text-muted-foreground">{t("emptyFiles")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {record.edits.map((path) => (
              <li key={path} className="font-mono text-xs">
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {/**
       * Last content section on purpose: what the run produced is the thing a
       * reader came for, so it closes the body. Only the token footer — which
       * is metadata, not content — comes after it.
       */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("outputLabel")}</span>
        {record.summary ? (
          <ExpandableText text={record.summary} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {running ? t("pendingOutput") : t("emptyOutput")}
          </p>
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted p-3 rounded-2xl">
        <TokenStat label={t("inputTokensLabel")} value={record.tokens.inputTokens} locale={locale} />
        <TokenStat label={t("outputTokensLabel")} value={record.tokens.outputTokens} locale={locale} />
        <TokenStat
          label={t("cachedInputTokensLabel")}
          value={record.tokens.cachedInputTokens}
          locale={locale}
        />
        <TokenStat label={t("reasoningTokensLabel")} value={record.tokens.reasoningTokens} locale={locale} />
      </div>
    </div>
  )
}

function TokenStat({
  label,
  value,
  locale,
}: {
  label: string
  value: number
  locale: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value.toLocaleString(locale)}</span>
    </div>
  )
}
