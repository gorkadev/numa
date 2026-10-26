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
