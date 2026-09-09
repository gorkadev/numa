/**
 * The whole toolkit, from one import.
 *
 * A game should be able to say what it needs in one line and then spend the
 * rest of the file on the game. `createGame()` at the bottom goes further and
 * assembles the pieces that almost every game wants in the same order every
 * time — the wiring below is not clever, it is just the wiring nobody should
 * have to write twice.
 */

export * from "./engine.js"
export * from "./math.js"
export * from "./input.js"
export * from "./controls.js"
export * from "./lighting.js"
export * from "./models.js"
export * from "./anim.js"
export * from "./physics.js"
export * from "./hud.js"
export * from "./sound.js"
export * from "./fx.js"
export * from "./state.js"

import { createEngine } from "./engine.js"
import { createInput, createPicker } from "./input.js"
import { addLighting, addEnvironment } from "./lighting.js"
import { createHud } from "./hud.js"
import { createAudio } from "./sound.js"
import { createPhysics } from "./physics.js"
import { createGameState } from "./state.js"
import { createShake } from "./anim.js"

/**
 * Builds the usual stack: engine, input, lighting, HUD, audio, and optionally
 * physics and state.
 *
 * Nothing here is required — every piece can be created on its own, and a game
 * that wants a different camera or no sound should do exactly that. This
 * exists so the first thirty lines of a game are not always the same thirty
 * lines.
 *
 * The engine is returned *not started*, so the game can build its world before
 * the first frame renders and the player never sees an empty scene.
 */
export function createGame(options = {}) {
  const {
    lighting = "day",
    environment = false,
    physics: physicsOptions = null,
    state: stateOptions = null,
    audio: audioOptions = {},
    hud: hudOptions = {},
    ...engineOptions
  } = options

  const engine = createEngine(engineOptions)
  const input = createInput(engine)
  const picker = createPicker(engine, input)
  const lights = lighting ? addLighting(engine, lighting) : null
  if (environment) addEnvironment(engine)
  const hud = createHud(engine, hudOptions)
  const audio = createAudio(engine, audioOptions)
  const shake = createShake(engine)
  const physics = physicsOptions ? createPhysics(engine, physicsOptions) : null
  const state = stateOptions ? createGameState(engine, stateOptions) : null

  return { engine, input, picker, lights, hud, audio, shake, physics, state }
}
