/**
 * The profile's activity numbers, computed in the browser from hourly UTC
 * buckets. The server never learns the viewer's time zone: it returns the
 * hours that had activity, and these functions fold them into the viewer's
 * own calendar days, so a turn at 00:30 in Madrid counts on that day and not
 * on the UTC day before it.
 */

export type ActivityMetric = "turns" | "credits" | "tokens"

export const ACTIVITY_METRICS = ["turns", "credits", "tokens"] as const satisfies readonly ActivityMetric[]

/** One UTC hour that had at least one turn. `hour` is an ISO timestamp. */
export type HourBucket = {
  hour: string
  turns: number
  credits: number
  tokens: number
}

/** The days the heatmap and its statistics cover, ending today. */
export const ACTIVITY_WINDOW_DAYS = 365

export type TopGame = { id: string; title: string; turns: number }

/** What the server reads for the profile; see `lib/profile/activity-queries.ts`. */
export type ProfileActivity = {
  buckets: HourBucket[]
  gameCount: number
  topGames: TopGame[]
}

/** Formats a date as "YYYY-MM-DD" in `timeZone` (en-CA's own date order). */
function dayFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

/** "YYYY-MM-DD" of `date` in `timeZone`. */
export function dayKey(date: Date, timeZone: string) {
  return dayFormatter(timeZone).format(date)
}

/** The metric summed per local day; days without activity are absent. */
export function dailyTotals(
  buckets: HourBucket[],
  metric: ActivityMetric,
  timeZone: string
) {
  const format = dayFormatter(timeZone)
  const totals = new Map<string, number>()
  for (const bucket of buckets) {
    const value = bucket[metric]
    if (value <= 0) continue
    const key = format.format(new Date(bucket.hour))
    totals.set(key, (totals.get(key) ?? 0) + value)
  }
  return totals
}

const DAY_MS = 86_400_000

function keyToUtc(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

function utcToKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

export type ActivityStats = {
  total: number
  activeDays: number
  /** Per calendar day of the window, active or not. */
  average: number
  peak: { date: string; value: number } | null
  /** Consecutive active days up to today, or up to yesterday while today is still empty. */
  currentStreak: number
  longestStreak: number
}

/** Statistics over the `windowDays` days that end on `today` ("YYYY-MM-DD"). */
export function activityStats(
  daily: Map<string, number>,
  today: string,
  windowDays: number
): ActivityStats {
  const end = keyToUtc(today)
  const start = end - (windowDays - 1) * DAY_MS

  let total = 0
  let activeDays = 0
  let peak: ActivityStats["peak"] = null
  let longestStreak = 0
  let run = 0

  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = utcToKey(ms)
    const value = daily.get(date) ?? 0
    if (value > 0) {
      total += value
      activeDays++
      run++
      longestStreak = Math.max(longestStreak, run)
      if (!peak || value > peak.value) peak = { date, value }
    } else {
      run = 0
    }
  }

  let currentStreak = 0
  let cursor = (daily.get(today) ?? 0) > 0 ? end : end - DAY_MS
  while (cursor >= start && (daily.get(utcToKey(cursor)) ?? 0) > 0) {
    currentStreak++
    cursor -= DAY_MS
  }

  return {
    total,
    activeDays,
    average: total / windowDays,
    peak,
    currentStreak,
    longestStreak,
  }
}
