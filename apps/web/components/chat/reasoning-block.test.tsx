import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"

import type { ReasoningUIPart } from "ai"

import en from "../../messages/en.json"
import es from "../../messages/es.json"
import { ReasoningBlock } from "./reasoning-block"

// The installed tsx runner uses classic JSX for source files outside Next.
Object.assign(globalThis, { React })

type RenderOptions = {
  /**
   * The run's own live flag, exactly as `chat-message.tsx` passes it: a part
   * can only be running while the run that carries it is.
   */
  streaming?: boolean
  locale?: "en" | "es"
}

function render(parts: ReasoningUIPart[], options: RenderOptions = {}) {
  const { streaming = false, locale = "en" } = options

  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === "en" ? en : es}
    >
      <ReasoningBlock parts={parts} streaming={streaming} />
    </NextIntlClientProvider>
  )
}

test("a reasoning part with no text is a plain line with nothing to open", () => {
  const html = render([{ type: "reasoning", text: "", state: "streaming" }], {
    streaming: true,
  })

  assert.match(html, /data-slot="trace"/)
  assert.match(html, /Thinking/)
  assert.match(html, /data-status="running"/)
  assert.doesNotMatch(html, /data-slot="trace-collapsible"/)
  assert.doesNotMatch(html, /aria-expanded/)
})

test("a done part with empty or whitespace-only text has no disclosure at all", () => {
  for (const text of ["", "   ", "\n\t  "]) {
    const html = render([{ type: "reasoning", text, state: "done" }])

    assert.match(html, /Thought/)
    assert.doesNotMatch(html, /data-slot="trace-collapsible"/)
    assert.doesNotMatch(html, /aria-expanded/)
  }
})

test("thinking opens while it streams and closes once it is finished", () => {
  const running = render(
    [
      {
        type: "reasoning",
        text: "Checking the level file.",
        state: "streaming",
      },
    ],
    { streaming: true }
  )

  assert.match(running, /Thinking/)
  assert.match(running, /aria-expanded="true"/)
  assert.match(running, /whitespace-pre-wrap/)
  assert.match(running, /Checking the level file\./)
  assert.match(running, /data-slot="spinner"/)

  const finished = render([
    { type: "reasoning", text: "Checked the level file.", state: "done" },
  ])

  assert.match(finished, /Thought/)
  assert.doesNotMatch(finished, /Thinking/)
  assert.match(finished, /aria-expanded="false"/)
  assert.doesNotMatch(finished, /data-status="running"/)
  assert.doesNotMatch(finished, /data-slot="spinner"/)
  /**
   * A closed disclosure must not keep its text in the document: with
   * `keepMounted` off it is absent, and this is what would catch it being
   * turned on later.
   */
  assert.doesNotMatch(finished, /Checked the level file\./)
})

/**
 * An aborted stream never emits `reasoning-end`, so the persisted part keeps
 * `state: "streaming"` forever. The run's own flag is the authority, and
 * without that gate the line spins after reload for the rest of the thread's
 * life.
 */
test("a streaming part only reads as running while the run is live", () => {
  const interrupted: ReasoningUIPart = {
    type: "reasoning",
    text: "Interrupted mid-sentence",
    state: "streaming",
  }

  const live = render([interrupted], { streaming: true })

  assert.match(live, /Thinking/)
  assert.match(live, /data-status="running"/)
  assert.match(live, /data-slot="spinner"/)
  assert.match(live, /aria-expanded="true"/)

  const aborted = render([interrupted])

  assert.match(aborted, /Thought/)
  assert.doesNotMatch(aborted, /Thinking/)
  assert.doesNotMatch(aborted, /data-status="running"/)
  assert.doesNotMatch(aborted, /data-slot="spinner"/)
  assert.match(aborted, /aria-expanded="false"/)
  assert.doesNotMatch(aborted, /Interrupted mid-sentence/)
})

test("each reasoning part is one line in the same trace", () => {
  const html = render(
    [
      { type: "reasoning", text: "First step", state: "streaming" },
      { type: "reasoning", text: "Second step", state: "streaming" },
    ],
    { streaming: true }
  )

  assert.equal((html.match(/data-slot="trace"/g) ?? []).length, 1)
  assert.equal((html.match(/data-slot="trace-line"/g) ?? []).length, 2)
  assert.match(html, /First step/)
  assert.match(html, /Second step/)
  assert.ok(html.indexOf("First step") < html.indexOf("Second step"))
})

test("the titles are localized in both locales", () => {
  const runningPart: ReasoningUIPart = {
    type: "reasoning",
    text: "Pensando en ello",
    state: "streaming",
  }
  const finishedPart: ReasoningUIPart = {
    type: "reasoning",
    text: "Pensado",
    state: "done",
  }

  assert.match(render([runningPart], { streaming: true }), /Thinking/)
  assert.match(render([finishedPart]), /Thought/)
  assert.match(
    render([runningPart], { streaming: true, locale: "es" }),
    /Pensando/
  )
  assert.match(render([finishedPart], { locale: "es" }), /Pensamiento/)
  assert.doesNotMatch(render([finishedPart], { locale: "es" }), /Thought/)
})
