"use client"

import { Database01Icon, Timer01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Progress } from "@workspace/ui/components/progress"

import { AnimatedNumber } from "@/components/animated-number"
import { TokenUsagePanel } from "@/components/chat/token-usage-panel"
import {
  UsagePanelHeader,
  UsageRow,
  UsageRows,
} from "@/components/chat/usage-panel"
import type { SessionUsage } from "@/lib/ai/session-usage"
import type { ContextUsage } from "@/lib/games/context-usage"
import {
  tokensPerSecond,
  type GenerationSpeed,
} from "@/lib/games/generation-speed"
import {
  averageTtft,
  formatDuration,
  type StepTimingTotals,
} from "@/lib/games/step-timing"

/**
 * What this chat has spent so far, as one quiet line under the composer.
 *
 * A footer rather than a badge on every reply: the per-turn receipt already
 * answers "what did that cost", and this answers the different question a
 * player has while chatting, "how much have I used". Each group is a trigger
 * for the detail behind it, so the line stays short and the numbers are there
 * when someone looks for them. The context ring and the session statistics
 * join this row as their data lands (see `odd/tasks/chat-usage-footer.md`).
 *
 * Always rendered, at zero before the first priced turn: a row that appears
 * when the first answer lands makes the composer jump, and a zero is what a
 * fresh chat has actually used.
 */
export function UsageFooter({
  usage,
  speed,
  activity,
  timing,
  context,
}: {
  usage: SessionUsage | null
  speed: GenerationSpeed | null
  activity: { turns: number; steps: number }
  timing: StepTimingTotals | null
  context: ContextUsage
}) {
  return (
    <div className="flex items-center justify-center gap-1 py-1 text-muted-foreground">
      <SessionStatistics speed={speed} activity={activity} timing={timing} />
      <TokenUsage usage={usage ?? EMPTY_USAGE} />
      <ContextRing context={context} />
    </div>
  )
}

/**
 * The orchestrator's turns, steps and generation speed over the session, as
 * the trigger of the statistics behind it. Zero until a reply has been
 * measured, for the same reason the other groups start at zero.
 *
 * Everything here is the orchestrator's alone: sub-agents run in parallel with
 * their own clocks, so adding them would make "time" mean work, not what the
 * reader waited for.
 */
function SessionStatistics({
  speed,
  activity,
  timing,
}: {
  speed: GenerationSpeed | null
  activity: { turns: number; steps: number }
  timing: StepTimingTotals | null
}) {
  const t = useTranslations("ChatUsage")
  const locale = useLocale()
  const rate = speed ? Math.round(tokensPerSecond(speed)) : 0
  const ttft = timing ? averageTtft(timing) : null
  const none = "—"

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="font-normal text-muted-foreground tabular-nums"
          />
        }
      >
        <AnimatedNumber value={activity.turns} />
        {t("turns", { count: activity.turns })}
        <AnimatedNumber value={activity.steps} />
        {t("steps", { count: activity.steps })}
        <span aria-hidden>·</span>
        <AnimatedNumber value={rate} suffix={` ${t("speed")}`} />
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-72 gap-3">
        <UsagePanelHeader
          icon={Timer01Icon}
          title={t("sessionStatistics")}
        />
        <UsageRows>
          <UsageRow
            label={t("llmTime")}
            value={timing ? formatDuration(timing.llmMs, locale) : none}
          />
          <UsageRow
            label={t("toolTime")}
            value={timing ? formatDuration(timing.toolMs, locale) : none}
          />
          <UsageRow
            label={t("avgTtft")}
            value={ttft === null ? none : formatDuration(ttft, locale)}
          />
          <UsageRow
            label={t("tps")}
            value={speed ? `${rate} ${t("speed")}` : none}
          />
        </UsageRows>
      </PopoverContent>
    </Popover>
  )
}

/** Shown before the first priced turn, so the row never changes shape when it arrives. */
const EMPTY_USAGE: SessionUsage = {
  total: 0,
  input: 0,
  cached: 0,
  uncached: 0,
  output: 0,
  reasoning: 0,
  cacheHit: 0,
  credits: undefined,
  provisional: false,
}

const RING_RADIUS = 6
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * How full the model's window is: the share of the window the latest request
 * used, as a small ring that opens a popover with the numbers behind it.
 *
 * The reading is the provider-reported input of the orchestrator's latest
 * step, so unlike the token total it falls again when compaction trims the
 * history. Clamped at 100%: a window cannot be more than full, and a reading
 * above it would only mean the declared window is out of date.
 *
 * The popover shows headroom, not tokens: input, output and reasoning already
 * live in the token panel, and a sub-agent's window is its own, not a slice of
 * this one.
 */
function ContextRing({ context }: { context: ContextUsage }) {
  const t = useTranslations("ChatUsage")
  const locale = useLocale()
  const ratio = Math.min(context.tokens / context.window, 1)
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  })
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={t("contextUsed", { percent })}
            className="font-normal text-muted-foreground tabular-nums"
          />
        }
      >
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2"
            className="stroke-muted"
          />
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
            className="stroke-current"
          />
        </svg>
        <AnimatedNumber
          value={ratio}
          format={{ style: "percent", maximumFractionDigits: 0 }}
          suffix={` ${t("contextSuffix")}`}
        />
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-72 gap-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">{t("contextUsed", { percent })}</span>
          <span className="text-muted-foreground tabular-nums">
            {compact.format(context.tokens)} / {compact.format(context.window)}
          </span>
        </div>
        <Progress value={ratio * 100} aria-label={t("contextUsedLabel")} />
        <UsageRows>
          <UsageRow
            label={t("free")}
            value={t("tokens", {
              count: compact.format(
                Math.max(context.window - context.tokens, 0)
              ),
            })}
          />
          {context.cached !== undefined ? (
            <UsageRow
              label={t("fromCache")}
              value={t("tokens", { count: compact.format(context.cached) })}
            />
          ) : null}
        </UsageRows>
      </PopoverContent>
    </Popover>
  )
}

function TokenUsage({ usage }: { usage: SessionUsage }) {
  const t = useTranslations("ChatUsage")

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="font-normal text-muted-foreground tabular-nums"
          />
        }
      >
        <HugeiconsIcon icon={Database01Icon} strokeWidth={2} />
        <AnimatedNumber
          value={usage.total}
          format={{ notation: "compact", maximumFractionDigits: 1 }}
        />
        {t("summaryLabel")}
        <AnimatedNumber
          value={usage.cacheHit}
          format={{ style: "percent", maximumFractionDigits: 0 }}
        />
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-72 gap-3">
        <TokenUsagePanel usage={usage} />
      </PopoverContent>
    </Popover>
  )
}
