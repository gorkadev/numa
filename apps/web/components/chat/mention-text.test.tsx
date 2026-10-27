import assert from "node:assert/strict"
import test from "node:test"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { MentionText } from "./mention-text"

// The installed tsx runner uses classic JSX for source files outside Next.
Object.assign(globalThis, { React })

test("a mentioned file shows as a chip with its name and its full path on hover", () => {
  const html = renderToStaticMarkup(
    <MentionText text="Usa @assets/Guns/AK.gltf ya" onOpenFile={() => {}} />
  )

  assert.equal(
    html,
    'Usa <button type="button" data-slot="mention-chip" title="assets/Guns/AK.gltf" class="inline rounded-md bg-primary-foreground/20 px-1 py-0.5 font-medium [box-decoration-break:clone] enabled:cursor-pointer enabled:hover:bg-primary-foreground/30">AK.gltf</button> ya'
  )
})

test("without a way to open files the chip is shown but disabled", () => {
  const html = renderToStaticMarkup(<MentionText text="@index.html" />)

  assert.match(html, /<button[^>]*disabled=""/)
})
