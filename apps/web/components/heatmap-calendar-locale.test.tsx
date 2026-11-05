import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HeatmapCalendar } from "@workspace/ui/components/heatmap-calendar"

Object.assign(globalThis, { React })

test("the heatmap names months in the locale it is given, not the runtime's", () => {
  const html = renderToStaticMarkup(
    <HeatmapCalendar calendarOnly data={[]} year={2026} locale="es" />
  )

  assert.match(html, />ene</)
  assert.doesNotMatch(html, />Jan</)
})

test("a date-only datum lands on its own calendar day east of UTC", () => {
  const previous = process.env.TZ
  process.env.TZ = "Europe/Madrid"
  try {
    const html = renderToStaticMarkup(
      <HeatmapCalendar
        calendarOnly
        data={[{ date: "2026-03-10", value: 5 }]}
        rangeDays={30}
        endDate={new Date(2026, 2, 20)}
        locale="en-US"
      />
    )

    assert.match(html, /aria-label="Mar 10, 2026: 5"/)
    assert.match(html, /aria-label="Mar 11, 2026: 0"/)
  } finally {
    process.env.TZ = previous
  }
})

test("the rolling window ends on its end date, with the latest days in the last column", () => {
  const html = renderToStaticMarkup(
    <HeatmapCalendar
      calendarOnly
      data={[]}
      rangeDays={365}
      endDate={new Date(2026, 10, 6)}
      locale="en-US"
    />
  )

  assert.match(html, /aria-label="Nov 7, 2025: 0"/)
  assert.doesNotMatch(html, /aria-label="Nov 6, 2025: 0"/)
  assert.match(html, /aria-label="Nov 6, 2026: (0|Upcoming)"/)
})
