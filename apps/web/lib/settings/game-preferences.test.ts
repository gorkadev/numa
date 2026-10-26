import assert from "node:assert/strict"
import { test } from "node:test"

import { gameSettingsOf, gameSettingsPatchSchema } from "./game-preferences"

test("a user with no settings row reads the defaults", () => {
  assert.deepEqual(gameSettingsOf(undefined), {
    improverOverageBilling: false,
    defaultTierId: null,
    showSessionStats: true,
  })
})

test("a stored tier that is no longer a tier reads as no preference", () => {
  assert.deepEqual(
    gameSettingsOf({
      improverOverageBilling: true,
      defaultTierId: "turbo",
      showSessionStats: false,
    }),
    { improverOverageBilling: true, defaultTierId: null, showSessionStats: false }
  )
  assert.equal(
    gameSettingsOf({
      improverOverageBilling: false,
      defaultTierId: "pro",
      showSessionStats: true,
    }).defaultTierId,
    "pro"
  )
})

test("a patch accepts one known field at a time and nothing else", () => {
  assert.deepEqual(gameSettingsPatchSchema.parse({ defaultTierId: "fast" }), {
    defaultTierId: "fast",
  })
  assert.deepEqual(gameSettingsPatchSchema.parse({ showSessionStats: false }), {
    showSessionStats: false,
  })
  assert.deepEqual(gameSettingsPatchSchema.parse({ improverOverageBilling: true }), {
    improverOverageBilling: true,
  })
  assert.throws(() => gameSettingsPatchSchema.parse({ defaultTierId: "turbo" }))
  assert.throws(() => gameSettingsPatchSchema.parse({ defaultTierId: null }))
  assert.throws(() => gameSettingsPatchSchema.parse({ showSessionStats: "no" }))
  assert.throws(() => gameSettingsPatchSchema.parse({}))
  assert.throws(() =>
    gameSettingsPatchSchema.parse({ showSessionStats: true, defaultTierId: "pro" })
  )
})
