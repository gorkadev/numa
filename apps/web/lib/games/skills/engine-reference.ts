import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s "The shape of a game" and "Making it look good" sections (source lines 177-245).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineReferenceSkill: Skill = {
  name: "engine-reference",
  description:
    "A full worked example of a game built from the toolkit, plus visual/style guidance.",
  trigger:
    "A task starts a new game from scratch, or needs guidance on lighting, palette, ground texture, feedback, or choosing 2D vs 3D.",
  body: `### The shape of a game

A game is a loop that runs through \`PHASES.MENU → PLAYING → OVER\`, and
back to \`PLAYING\` on restart, never a page reload. The pattern below is the
whole lifecycle: a menu panel that starts the run, per-frame logic gated on
\`state.isPlaying\`, a game-over panel driven by \`state.on(PHASES.OVER, ...)\`,
and a \`startRun()\` both the menu and the game-over panel call — it resets
the score, the player's position, and every spawned entity, and disposes
what it removes so restarting ten times doesn't leak ten runs' worth of
meshes and update handlers.

\`\`\`js
import {
  createGame, createGround, createCharacter, createCoin, createFollowCamera,
  createPlayerMotor, collect, spin, float, disposeObject, PHASES, PALETTE,
} from "./engine/index.js"

const { engine, input, hud, audio, physics, state, shake } = createGame({
  lighting: "day",
  physics: {},
  state: { values: { score: 0 }, saveKey: "coins" },
})

const ground = createGround({ size: 80 })
engine.add(ground)
physics.addStatic(ground)

const SPAWN = { x: 0, y: 0, z: 0 }
const player = createCharacter({ color: PALETTE.blue })
engine.add(player)
const body = physics.addBody(player, { size: [0.7, 1.8, 0.7] })
createPlayerMotor(engine, input, player, { body })
const camera = createFollowCamera(engine, player)

const COIN_COUNT = 12
let coins = []

/** spin()/float() each return a stop function — kept so a collected or
 *  restarted coin's update handler can be torn down, not just its mesh. */
function spawnCoin(i) {
  const coin = createCoin()
  coin.position.set(Math.sin(i) * 12, 1, Math.cos(i) * 12)
  engine.add(coin)
  const stopSpin = spin(engine, coin, 2)
  const stopFloat = float(engine, coin)
  coin.userData.cleanup = () => {
    stopSpin()
    stopFloat()
  }
  return coin
}

function clearCoins() {
  for (const coin of coins) {
    coin.userData.cleanup()
    disposeObject(coin)
  }
  coins = []
}

const score = hud.stat("Score", 0)
state.watch("score", (value) => score.set(value))
hud.keys([{ keys: ["W", "A", "S", "D"], label: "Move" }])

engine.onUpdate(() => {
  if (!state.isPlaying) return
  collect(coins, player, 1.4, (coin) => {
    coin.userData.cleanup()
    disposeObject(coin)
    state.add("score", 1)
    audio.sfx.coin()
    shake.add(0.15)
    if (coins.length === 0) state.to(PHASES.OVER)
  })
})

/** Menu → Start and Over → Play again both land here: reset before playing,
 *  never accumulate state from the previous run. */
function startRun() {
  clearCoins()
  player.position.set(SPAWN.x, SPAWN.y, SPAWN.z)
  body.velocity.set(0, 0, 0)
  for (let i = 0; i < COIN_COUNT; i++) coins.push(spawnCoin(i))
  camera.snap()
  state.reset()
  state.to(PHASES.PLAYING)
}

/** hud.panel() pauses the engine while it's up and focuses its first button,
 *  so Enter/Space works as "press a key" without any extra wiring. */
hud.panel({
  title: "Coin Run",
  body: "Collect every coin. WASD to move.",
  actions: [{ label: "Start", onClick: startRun }],
})

state.on(PHASES.OVER, () => {
  hud.panel({
    title: "Game Over",
    body: \`You collected \${state.get("score")} coins.\`,
    actions: [{ label: "Play again", onClick: startRun }],
  })
})

engine.start()
\`\`\`

### Pooling instead of spawn/dispose per entity

The pattern above disposes and recreates coins because there are only a
dozen. Past a few hundred short-lived objects (bullets, enemies, debris),
creating and disposing a mesh per spawn is the stutter — keep a fixed array
of meshes instead, toggle \`.visible\` and reposition instead of
adding/removing, and reuse the oldest one when the pool is full (the same
cursor-wraps trick \`createParticles\`'s \`burst()\` uses internally). Past a
few hundred *identical* copies with no independent behaviour (grass, a
crowd), skip the pool entirely and use \`createField\`/\`InstancedMesh\`
instead — one draw call for all of them.

### Making it look good

- Pick a lighting preset first. An unlit scene is grey plastic, and no amount
  of geometry fixes it.
- Use \`PALETTE\` colours together. Three of them look designed; three colours
  picked separately clash.
- Give the ground a texture or a grid. A blank floor gives the eye nothing to
  measure motion against, and the game feels like it is standing still.
- Add feedback before adding features: a \`flash\` on hit, a \`shake\` on impact,
  a \`popIn\` on spawn and a sound on every one of them is worth more than
  another mechanic.
- 2D is still a legitimate answer. An orthographic camera or a flat canvas
  game is the right build for Tetris or a card game, and dressing one up in
  perspective makes it harder to read, not better.`,
}
