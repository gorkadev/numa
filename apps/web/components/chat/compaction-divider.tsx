"use client"

import { useTranslations } from "next-intl"
import { ArrowDown01Icon, ArrowShrink02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Spinner } from "@workspace/ui/components/spinner"

import { Markdown } from "@/components/chat/markdown"
import type { CompactionData } from "@/lib/games/compaction"

/**
 * Where the agent's memory of the thread was compacted (chat-compaction S5):
 * everything above stays readable, but the agent continues from the summary,
 * which opens below the line.
 */
export function CompactionDivider({ compaction }: { compaction: CompactionData }) {
  const t = useTranslations("ChatMessages")

  return (
    <Collapsible className="flex flex-col gap-2">
      <CollapsibleTrigger className="group flex items-center gap-3 text-xs text-muted-foreground hover:text-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={ArrowShrink02Icon} strokeWidth={2} className="size-3.5" />
          {compaction.trigger === "auto" ? t("compactedAuto") : t("compacted")}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-3.5 transition-transform group-data-panel-open:rotate-180"
          />
        </span>
        <span className="h-px flex-1 bg-border" />
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("compactedSummary")}</p>
        <Markdown>{compaction.summary}</Markdown>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Shown while a summary is being written, where its divider will appear. */
export function CompactingDivider() {
  const t = useTranslations("ChatMessages")

  return (
    <div role="status" className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-2">
        <Spinner className="size-3.5" />
        {t("compacting")}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
