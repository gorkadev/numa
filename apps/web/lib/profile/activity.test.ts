import assert from "node:assert/strict"
import test from "node:test"

import { activityStats, dailyTotals, type HourBucket } from "./activity"

const bucket = (hour: string, turns: number, credits = 0, tokens = 0): HourBucket => ({
  hour,
  turns,
  credits,
  tokens,
})

test("hours are binned into the viewer's local day, not the UTC day", () => {
  const buckets = [bucket("2026-03-09T23:00:00.000Z", 2), bucket("2026-03-10T10:00:00.000Z", 1)]

  assert.deepEqual(
    Object.fromEntries(dailyTotals(buckets, "turns", "Europe/Madrid")),
    { "2026-03-10": 3 }
  )
  assert.deepEqual(
    Object.fromEntries(dailyTotals(buckets, "turns", "UTC")),
    { "2026-03-09": 2, "2026-03-10": 1 }
  )
})

test("each metric sums its own column", () => {
  const buckets = [bucket("2026-03-10T10:00:00.000Z", 2, 30, 4_000), bucket("2026-03-10T11:00:00.000Z", 1, 5, 900)]

  assert.equal(dailyTotals(buckets, "turns", "UTC").get("2026-03-10"), 3)
  assert.equal(dailyTotals(buckets, "credits", "UTC").get("2026-03-10"), 35)
  assert.equal(dailyTotals(buckets, "tokens", "UTC").get("2026-03-10"), 4_900)
})

test("statistics cover the window ending today", () => {
  const daily = new Map([
    ["2026-03-01", 4],
    ["2026-03-02", 2],
    ["2026-03-05", 9],
  ])

  const stats = activityStats(daily, "2026-03-10", 10)

  assert.equal(stats.total, 15)
  assert.equal(stats.activeDays, 3)
  assert.equal(stats.average, 1.5)
  assert.deepEqual(stats.peak, { date: "2026-03-05", value: 9 })
  assert.equal(stats.longestStreak, 2)
  assert.equal(stats.currentStreak, 0)
})

test("days before the window are left out", () => {
  const stats = activityStats(new Map([["2026-02-28", 7], ["2026-03-10", 1]]), "2026-03-10", 10)

  assert.equal(stats.total, 1)
  assert.equal(stats.activeDays, 1)
})

test("the current streak counts back from today, or from yesterday while today is still empty", () => {
  const throughToday = new Map([["2026-03-08", 1], ["2026-03-09", 1], ["2026-03-10", 1]])
  const throughYesterday = new Map([["2026-03-08", 1], ["2026-03-09", 1]])

  assert.equal(activityStats(throughToday, "2026-03-10", 30).currentStreak, 3)
  assert.equal(activityStats(throughYesterday, "2026-03-10", 30).currentStreak, 2)
})

test("streaks cross month and year boundaries", () => {
  const daily = new Map([["2025-12-31", 1], ["2026-01-01", 1], ["2026-01-02", 1]])

  assert.equal(activityStats(daily, "2026-01-02", 30).longestStreak, 3)
})

test("no activity reads as zeros and no peak", () => {
  const stats = activityStats(new Map(), "2026-03-10", 365)

  assert.deepEqual(stats, {
    total: 0,
    activeDays: 0,
    average: 0,
    peak: null,
    currentStreak: 0,
    longestStreak: 0,
  })
})
