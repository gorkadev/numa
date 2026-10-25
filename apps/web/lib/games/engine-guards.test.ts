import assert from "node:assert/strict"
import * as nodeModule from "node:module"
import { test } from "node:test"

// The installed runtime supports synchronous hooks; bundled Node types predate them.
type Resolve = (specifier: string, context: object) => { url: string }
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: object, next: Resolve) => { url: string }
  }) => void
}
// In a game, "three" comes from the page's import map; here, from the same vendored files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") {
      return nextResolve(new URL("./runtime/vendor/three/three.module.min.js", import.meta.url).href, context)
    }
    if (specifier.startsWith("three/addons/")) {
      return nextResolve(new URL(`./runtime/vendor/three/addons/${specifier.slice("three/addons/".length)}`, import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
})

// The runtime ships as plain JS into every sandbox; it is tested from here so
// no test file is ever copied into a game.
const { defaultMount } = await import("./runtime/engine/engine.js")
const { addLighting, LIGHTING_PRESETS } = await import("./runtime/engine/lighting.js")

function fakeDocument(app: { clientHeight: number } | null) {
  const body = { tag: "body" }
  return { body, getElementById: (id: string) => (id === "app" ? app : null) }
}

test("the engine fills a sized #app when the page has one", () => {
  const app = { clientHeight: 720 }
  assert.equal(defaultMount(fakeDocument(app) as unknown as Document), app)
})

test("without #app, or with an empty one, the engine fills body as before", () => {
  const none = fakeDocument(null)
  const empty = fakeDocument({ clientHeight: 0 })

  assert.equal(defaultMount(none as unknown as Document), none.body)
  assert.equal(defaultMount(empty as unknown as Document), empty.body)
})

test("an unknown lighting preset fails with the valid names instead of a crash deep inside", () => {
  assert.throws(
    () => addLighting({} as never, "sunny" as never),
    (error: Error) =>
      error.message.includes('"sunny"') &&
      Object.keys(LIGHTING_PRESETS).every((name) => error.message.includes(name))
  )
})
