"use client"

import { useMemo, useState } from "react"
import { PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  HeatmapCalendar,
  type HeatmapDatum,
} from "@workspace/ui/components/heatmap-calendar"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import { initials } from "@/lib/format/initials"

type Mode = "daily" | "weekly" | "cumulative"
type Labels = Record<
  | "title"
  | "sample"
  | "exampleHandle"
  | "games"
  | "tokens"
  | "days"
  | "integrations"
  | "activity"
  | "daily"
  | "weekly"
  | "cumulative"
  | "less"
  | "more"
  | "units"
  | "statistics"
  | "activeDays"
  | "average"
  | "peak"
  | "mostUsed"
  | "exampleIntegration"
  | "notConnected",
  string
>

// Fixed example series: no account usage or integration information is queried here.
function exampleDaily(index: number) {
  return index % 11 === 0
    ? 0
    : ((index * 17 + Math.floor(index / 7) * 3) % 8) + 1
}

export function ProfilePage({
  name,
  email,
  image,
  labels,
  locale,
}: {
  name: string
  email: string
  image?: string | null
  labels: Labels
  locale: string
}) {
  const t = useTranslations("Profile")
  const [mode, setMode] = useState<Mode>("daily")
  const [today] = useState(() => new Date())
  const year = today.getFullYear()
  // Calendar keys are UTC dates, but "today" follows the viewer's local calendar day.
  const dayCount =
    Math.round(
      (Date.UTC(year, today.getMonth(), today.getDate()) -
        Date.UTC(year, 0, 1)) /
        86_400_000
    ) + 1
  const dailyValues = useMemo(
    () => Array.from({ length: dayCount }, (_, index) => exampleDaily(index)),
    [dayCount]
  )
  const total = dailyValues.reduce((sum, value) => sum + value, 0)
  const activeDays = dailyValues.filter((value) => value > 0).length
  const peak = Math.max(...dailyValues)
  const formatNumber = new Intl.NumberFormat(locale)
  const data = useMemo<HeatmapDatum[]>(() => {
    let cumulative = 0
    return dailyValues.map((daily, index) => {
      cumulative += daily
      const value =
        mode === "daily"
          ? daily
          : mode === "weekly"
            ? dailyValues
                .slice(Math.max(0, index - 6), index + 1)
                .reduce((sum, count) => sum + count, 0)
            : cumulative
      return { date: new Date(Date.UTC(year, 0, index + 1)), value }
    })
  }, [dailyValues, mode, year])

  const summary = [
    { label: labels.games, value: formatNumber.format(12) },
    { label: labels.tokens, value: formatNumber.format(total) },
    { label: labels.days, value: formatNumber.format(activeDays) },
    { label: labels.integrations, value: formatNumber.format(0) },
  ]
  const statistics = [
    { label: labels.activeDays, value: formatNumber.format(activeDays) },
    {
      label: labels.average,
      value: `${formatNumber.format(Math.round(total / dayCount))} ${labels.units}`,
    },
    {
      label: labels.peak,
      value: `${formatNumber.format(peak)} ${labels.units}`,
    },
  ]

  return (
    <main className="w-full min-w-0">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 px-4">
        <MobileSidebarTrigger className="-ms-1.5" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
          {labels.title}
        </h1>
        <Button variant="ghost" size="sm" disabled>
          <HugeiconsIcon icon={PencilEdit01Icon} />
          {t("edit")}
        </Button>
      </header>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar className="size-20">
            <AvatarImage src={image ?? undefined} alt={name} />
            <AvatarFallback className="text-2xl">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{name}</h2>
            <p className="text-muted-foreground">{email}</p>
            <p className="text-sm text-muted-foreground">
              {labels.exampleHandle}
            </p>
          </div>
          <p className="rounded-md bg-muted px-3 py-1 text-sm text-muted-foreground">
            {labels.sample}
          </p>
        </div>

        <div
          className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card md:grid-cols-4"
          aria-label={labels.title}
        >
          {summary.map(({ label, value }) => (
            <div
              key={label}
              className="relative min-w-0 p-3 text-center after:absolute after:inset-y-3 after:right-0 after:w-px after:bg-border even:after:hidden md:last:after:hidden md:even:after:block"
            >
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="truncate text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <section aria-label={labels.activity} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{labels.activity}</h2>
            <ToggleGroup
              value={[mode]}
              onValueChange={(values) => {
                const next = values[0]
                if (
                  next === "daily" ||
                  next === "weekly" ||
                  next === "cumulative"
                )
                  setMode(next)
              }}
              variant="outline"
              size="sm"
              aria-label={labels.activity}
            >
              {(["daily", "weekly", "cumulative"] as const).map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  aria-label={labels[option]}
                >
                  {labels[option]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <HeatmapCalendar
            calendarOnly
            data={data}
            year={year}
            cellSize={10}
            cellGap={2}
            tooltipDelay={150}
            scale="quantile"
            levelClassNames={[
              "bg-muted",
              "bg-blue-200 dark:bg-blue-950",
              "bg-blue-400 dark:bg-blue-800",
              "bg-blue-600 dark:bg-blue-600",
              "bg-blue-800 dark:bg-blue-400",
            ]}
            renderTooltip={(cell) => (
              <span>
                {cell.label}: {formatNumber.format(cell.value)} {labels.units} ·{" "}
                {labels.sample}
              </span>
            )}
            axisLabels={{ showWeekdays: false }}
          />
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{labels.statistics}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{labels.sample}</p>
              {statistics.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 border-b pb-2 last:border-0"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <strong className="tabular-nums">{value}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{labels.mostUsed}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{labels.sample}</p>
              <div className="rounded-lg border p-3">
                <p className="font-medium">{labels.exampleIntegration}</p>
                <p className="text-sm text-muted-foreground">
                  {labels.notConnected}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
