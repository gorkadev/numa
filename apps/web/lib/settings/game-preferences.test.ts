import assert from "node:assert/strict"
import { test } from "node:test"

import { gameSettingsOf, gameSettingsPatchSchema } from "./game-preferences"

test("a user with no settings row reads the defaults", () => {
  assert.deepEqual(gameSettingsOf(undefined), {
    improverOverageBilling: false,
    defaultTierId: null,
    showSessionStats: true,
    wrapCodeBlocks: true,
    profileActivityMetric: "turns",
    messageAnimation: "slide-up",
  })
})

test("a stored message animation that is no longer a preset reads as slide-up", () => {
  const row = {
    improverOverageBilling: false,
    defaultTierId: null,
    showSessionStats: true,
    wrapCodeBlocks: true,
  }

  assert.equal(gameSettingsOf({ ...row, messageAnimation: "pop" }).messageAnimation, "pop")
  assert.equal(gameSettingsOf({ ...row, messageAnimation: "none" }).messageAnimation, "none")
  assert.equal(gameSettingsOf({ ...row, messageAnimation: "wobble" }).messageAnimation, "slide-up")
})

test("a stored profile metric that is no longer a metric reads as turns", () => {
  const row = {
    improverOverageBilling: false,
    defaultTierId: null,
    showSessionStats: true,
    wrapCodeBlocks: true,
  }

  assert.equal(gameSettingsOf({ ...row, profileActivityMetric: "credits" }).profileActivityMetric, "credits")
  assert.equal(gameSettingsOf({ ...row, profileActivityMetric: "minutes" }).profileActivityMetric, "turns")
})

test("a stored tier that is no longer a tier reads as no preference", () => {
  assert.deepEqual(
    gameSettingsOf({
      improverOverageBilling: true,
      defaultTierId: "turbo",
      showSessionStats: false,
      wrapCodeBlocks: false,
      profileActivityMetric: "tokens",
    }),
    {
      improverOverageBilling: true,
      defaultTierId: null,
      showSessionStats: false,
      wrapCodeBlocks: false,
      profileActivityMetric: "tokens",
      messageAnimation: "slide-up",
    }
  )
  assert.equal(
    gameSettingsOf({
      improverOverageBilling: false,
      defaultTierId: "pro",
      showSessionStats: true,
      wrapCodeBlocks: true,
      profileActivityMetric: "turns",
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
  assert.deepEqual(gameSettingsPatchSchema.parse({ wrapCodeBlocks: false }), {
    wrapCodeBlocks: false,
  })
  assert.deepEqual(gameSettingsPatchSchema.parse({ profileActivityMetric: "credits" }), {
    profileActivityMetric: "credits",
  })
  assert.deepEqual(gameSettingsPatchSchema.parse({ messageAnimation: "blur-fade" }), {
    messageAnimation: "blur-fade",
  })
  assert.throws(() => gameSettingsPatchSchema.parse({ messageAnimation: "wobble" }))
  assert.throws(() => gameSettingsPatchSchema.parse({ profileActivityMetric: "minutes" }))
  assert.throws(() => gameSettingsPatchSchema.parse({ wrapCodeBlocks: "yes" }))
  assert.throws(() => gameSettingsPatchSchema.parse({ defaultTierId: "turbo" }))
  assert.throws(() => gameSettingsPatchSchema.parse({ defaultTierId: null }))
  assert.throws(() => gameSettingsPatchSchema.parse({ showSessionStats: "no" }))
  assert.throws(() => gameSettingsPatchSchema.parse({}))
  assert.throws(() =>
    gameSettingsPatchSchema.parse({ showSessionStats: true, defaultTierId: "pro" })
  )
})
