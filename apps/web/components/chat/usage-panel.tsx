import type { ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The layout every usage popover shares: a header with an icon, a title and an
 * optional total, then a ruled list of label/value rows.
 *
 * One component so the footer's token and context panels and the per-reply
 * receipt cannot drift into three looks for the same kind of information.
 * Presentational on purpose: it formats nothing, callers pass the strings.
 */
export function UsagePanelHeader({
  icon,
  title,
  value,
}: {
  icon: IconSvgElement
  title: string
  value?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm font-medium">
      <span className="flex items-center gap-2">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
        {title}
      </span>
      {value ? <span className="tabular-nums">{value}</span> : null}
    </div>
  )
}

export function UsageRows({ children }: { children: ReactNode }) {
  return (
    <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
      {children}
    </dl>
  )
}

export function UsageRow({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  /** The row that sums up the others, set apart from them. */
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        strong && "border-t border-border pt-1.5 font-medium text-foreground"
      )}
    >
      <dt className="min-w-0 truncate">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}
