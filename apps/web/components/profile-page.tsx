"use client"

import { useMemo, useSyncExternalStore } from "react"
import { PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
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

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import { useSettingsDialog } from "@/hooks/use-settings-dialog"
import { initials } from "@/lib/format/initials"
import {
  ACTIVITY_WINDOW_DAYS,
  activityStats,
  dailyTotals,
  dayKey,
  type ActivityMetric,
  type ProfileActivity,
} from "@/lib/profile/activity"

function subscribeNever() {
  return () => {}
}

/**
 * The viewer's time zone. The server renders in UTC; hydration keeps that
 * value, then React re-renders with the browser's own zone, so days are the
 * viewer's local days without the server ever having to know them.
 */
function useTimeZone() {
  return useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC"
  )
}

export function ProfilePage({
  name,
  email,
  image,
  username,
  locale,
  metric,
  activity,
}: {
  name: string
  email: string
  image?: string | null
  username: string | null
  locale: string
  metric: ActivityMetric
  activity: ProfileActivity
}) {
  const t = useTranslations("Profile")
  const format = useFormatter()
  const { openSettings } = useSettingsDialog()
  const timeZone = useTimeZone()

  const daily = useMemo(
    () => dailyTotals(activity.buckets, metric, timeZone),
    [activity.buckets, metric, timeZone]
  )
  const today = dayKey(new Date(), timeZone)
  const stats = activityStats(daily, today, ACTIVITY_WINDOW_DAYS)
  const data = useMemo<HeatmapDatum[]>(
    () => Array.from(daily, ([date, value]) => ({ date, value })),
    [daily]
  )

  const number = (value: number) =>
    format.number(value, { maximumFractionDigits: 1 })
  const withUnit = (value: number) =>
    `${number(value)} ${t(`units.${metric}`, { count: value })}`

  const summary = [
    { label: t("games"), value: number(activity.gameCount) },
    { label: t(`metrics.${metric}`), value: number(stats.total) },
    { label: t("activeDays"), value: number(stats.activeDays) },
    {
      label: t("currentStreak"),
      value: t("days", { count: stats.currentStreak }),
    },
  ]
  const statistics = [
    { label: t("average"), value: withUnit(stats.average) },
    {
      label: t("peak"),
      value: stats.peak
        ? `${format.dateTime(new Date(`${stats.peak.date}T12:00:00`), {
            day: "numeric",
            month: "short",
          })} · ${withUnit(stats.peak.value)}`
        : "—",
    },
    {
      label: t("longestStreak"),
      value: t("days", { count: stats.longestStreak }),
    },
  ]

  return (
    <main className="w-full min-w-0">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 px-4">
        <MobileSidebarTrigger className="-ms-1.5" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("title")}
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openSettings("account")}
        >
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
            {username ? (
              <p className="text-muted-foreground">@{username}</p>
            ) : (
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => openSettings("account", "username")}
              >
                {t("setUsername")}
              </button>
            )}
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        <Card
          className="grid grid-cols-2 gap-0 py-0 md:grid-cols-4"
          aria-label={t("title")}
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
        </Card>

        <section aria-labelledby="profile-activity" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="profile-activity" className="text-lg font-semibold">
              {t(`total.${metric}`, { count: stats.total })}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openSettings("account", "profile-activity")}
            >
              {t("changeMetric")}
            </Button>
          </div>
          <HeatmapCalendar
            calendarOnly
            data={data}
            rangeDays={ACTIVITY_WINDOW_DAYS}
            cellSize={10}
            cellGap={2}
            tooltipDelay={150}
            locale={locale}
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
                {cell.label}: {withUnit(cell.value)}
              </span>
            )}
            axisLabels={{ showWeekdays: false }}
          />
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("statistics")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {statistics.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 border-b pb-2 last:border-0"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <strong className="text-end tabular-nums">{value}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("topGames")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activity.topGames.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noGames")}</p>
              ) : (
                activity.topGames.map((game) => (
                  <Link
                    key={game.id}
                    href={`/games/${game.id}`}
                    className="flex justify-between gap-4 border-b pb-2 last:border-0 hover:text-foreground"
                  >
                    <span className="min-w-0 truncate">{game.title}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {t("turnCount", { count: game.turns })}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
