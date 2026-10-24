"use client"

import { Database01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Progress } from "@workspace/ui/components/progress"

import {
  UsagePanelHeader,
  UsageRow,
  UsageRows,
} from "@/components/chat/usage-panel"
import type { SessionUsage } from "@/lib/ai/session-usage"
import type { ContextUsage } from "@/lib/games/context-usage"

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
  context,
}: {
  usage: SessionUsage | null
  context: ContextUsage
}) {
  return (
    <div className="flex items-center justify-center gap-1 py-1 text-muted-foreground">
      <TokenUsage usage={usage ?? EMPTY_USAGE} />
      <ContextRing context={context} />
    </div>
  )
}

/** Shown before the first priced turn, so the row never changes shape when it arrives. */
const EMPTY_USAGE: SessionUsage = {
  total: 0,
  input: 0,
  cached: 0,
  uncached: 0,
  output: 0,
  cacheHit: 0,
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
        {percent}
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
  const locale = useLocale()
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  })
  const exact = new Intl.NumberFormat(locale)
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  })
  const tokens = (count: number) => t("tokens", { count: exact.format(count) })

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
        {t("summary", {
          tokens: compact.format(usage.total),
          cacheHit: percent.format(usage.cacheHit),
        })}
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-72 gap-3">
        <UsagePanelHeader
          icon={Database01Icon}
          title={t("tokenUsage")}
          value={tokens(usage.total)}
        />
        <UsageRows>
          <UsageRow
            label={t("cacheHit")}
            value={percent.format(usage.cacheHit)}
          />
          <UsageRow label={t("uncachedInput")} value={tokens(usage.uncached)} />
          <UsageRow label={t("cachedInput")} value={tokens(usage.cached)} />
          <UsageRow label={t("output")} value={tokens(usage.output)} />
        </UsageRows>
      </PopoverContent>
    </Popover>
  )
}
