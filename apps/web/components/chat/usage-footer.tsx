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

import type { SessionUsage } from "@/lib/ai/session-usage"

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
 * Renders nothing before the first priced turn: a row of zeros under a fresh
 * chat would read as a free session rather than an empty one.
 */
export function UsageFooter({ usage }: { usage: SessionUsage | null }) {
  if (!usage) return null

  return (
    <div className="flex items-center justify-center gap-1 pt-1 text-muted-foreground">
      <TokenUsage usage={usage} />
    </div>
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
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Database01Icon}
              strokeWidth={2}
              className="size-4"
            />
            {t("tokenUsage")}
          </span>
          <span className="tabular-nums">
            {t("tokens", { count: exact.format(usage.total) })}
          </span>
        </div>
        <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
          <Row label={t("cacheHit")} value={percent.format(usage.cacheHit)} />
          <Row
            label={t("uncachedInput")}
            value={t("tokens", { count: exact.format(usage.uncached) })}
          />
          <Row
            label={t("cachedInput")}
            value={t("tokens", { count: exact.format(usage.cached) })}
          />
          <Row
            label={t("output")}
            value={t("tokens", { count: exact.format(usage.output) })}
          />
        </dl>
      </PopoverContent>
    </Popover>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0 truncate">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}
