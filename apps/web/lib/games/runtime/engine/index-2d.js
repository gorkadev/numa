/**
 * The whole 2D toolkit, from one import.
 *
 * A 2D game's sandbox ships this file as `engine/index.js`. It is the 3D
 * index without the modules a flat, unlit game has no use for — lighting,
 * models and camera controls are not in a 2D sandbox at all — plus the
 * sprite and tile map modules. `createGame()` at the bottom assembles the
 * pieces almost every game wants, in the same order every time.
 */

export * from "./engine.js"
export * from "./math.js"
export * from "./input.js"
export * from "./anim.js"
export * from "./physics.js"
export * from "./hud.js"
export * from "./touch.js"
export * from "./sound.js"
export * from "./fx.js"
export * from "./state.js"
export * from "./sprites.js"
export * from "./tilemap.js"

import { createEngine } from "./engine.js"
import { createInput, createPicker } from "./input.js"
import { createHud } from "./hud.js"
import { createAudio } from "./sound.js"
import { createPhysics } from "./physics.js"
import { createGameState } from "./state.js"
import { createShake } from "./anim.js"

/**
 * Builds the usual stack: engine, input, HUD, audio, and optionally physics
 * and state.
 *
 * No lighting: sprites and tiles are unlit and show their pixels exactly.
 * Pass the orthographic camera options (`orthographic`, `frustumSize`, ...)
 * straight through to the engine.
 *
 * The engine is returned *not started*, so the game can load its textures
 * and build its world before the first frame renders.
 */
export function createGame(options = {}) {
  const {
    physics: physicsOptions = null,
    state: stateOptions = null,
    audio: audioOptions = {},
    hud: hudOptions = {},
    ...engineOptions
  } = options

  const engine = createEngine(engineOptions)
  const input = createInput(engine)
  const picker = createPicker(engine, input)
  const hud = createHud(engine, { ...hudOptions, input })
  const audio = createAudio(engine, audioOptions)
  const shake = createShake(engine)
  const physics = physicsOptions ? createPhysics(engine, physicsOptions) : null
  const state = stateOptions ? createGameState(engine, stateOptions) : null

  return { engine, input, picker, hud, audio, shake, physics, state }
}
