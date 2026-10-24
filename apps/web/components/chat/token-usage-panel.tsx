"use client"

import { Database01Icon } from "@hugeicons/core-free-icons"
import { useLocale, useTranslations } from "next-intl"

import {
  UsagePanelHeader,
  UsageRow,
  UsageRows,
} from "@/components/chat/usage-panel"
import type { SessionUsage } from "@/lib/ai/session-usage"

/**
 * Token usage and credits, the same panel for the whole session (footer) and
 * for one turn (the reply's receipt), fed by the same `sumSessionUsage` — so
 * the two can never label or split the same numbers differently.
 *
 * Reasoning only shows when the model reasoned: a row of zeros for models that
 * never do is noise. Credits only show when a reply carried a charge.
 */
export function TokenUsagePanel({ usage }: { usage: SessionUsage }) {
  const t = useTranslations("ChatUsage")
  const locale = useLocale()
  const exact = new Intl.NumberFormat(locale)
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  })
  const tokens = (count: number) => t("tokens", { count: exact.format(count) })

  return (
    <section className="flex flex-col gap-3">
      <UsagePanelHeader
        icon={Database01Icon}
        title={t("tokenUsage")}
        value={tokens(usage.total)}
      />
      <UsageRows>
        <UsageRow label={t("cacheHit")} value={percent.format(usage.cacheHit)} />
        <UsageRow label={t("uncachedInput")} value={tokens(usage.uncached)} />
        <UsageRow label={t("cachedInput")} value={tokens(usage.cached)} />
        <UsageRow label={t("output")} value={tokens(usage.output)} />
        {usage.reasoning > 0 ? (
          <UsageRow label={t("reasoning")} value={tokens(usage.reasoning)} />
        ) : null}
        {usage.credits !== undefined ? (
          <UsageRow
            strong
            label={t("credits")}
            value={exact.format(usage.credits)}
          />
        ) : null}
      </UsageRows>
    </section>
  )
}
