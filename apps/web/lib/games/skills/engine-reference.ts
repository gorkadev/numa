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

\`\`\`js
import {
  createGame, createGround, createCharacter, createCoin, createFollowCamera,
  createPlayerMotor, collect, spin, float, PHASES, PALETTE,
} from "./engine/index.js"

const { engine, input, hud, audio, physics, state, shake } = createGame({
  lighting: "day",
  physics: {},
  state: { values: { score: 0 }, saveKey: "coins" },
})

const ground = createGround({ size: 80 })
engine.add(ground)
physics.addStatic(ground)

const player = createCharacter({ color: PALETTE.blue })
engine.add(player)
const body = physics.addBody(player, { size: [0.7, 1.8, 0.7] })
createPlayerMotor(engine, input, player, { body })
createFollowCamera(engine, player).snap()

const coins = []
for (let i = 0; i < 12; i++) {
  const coin = createCoin()
  coin.position.set(Math.sin(i) * 12, 1, Math.cos(i) * 12)
  engine.add(coin)
  spin(engine, coin, 2)
  float(engine, coin)
  coins.push(coin)
}

const score = hud.stat("Score", 0)
state.watch("score", (value) => score.set(value))
hud.keys([
  { keys: ["W", "A", "S", "D"], label: "Move" },
  { keys: ["Space"], label: "Jump" },
])

engine.onUpdate(() => {
  if (input.pressed("Space") && physics.jump(body)) audio.sfx.jump()
  collect(coins, player, 1.4, (coin) => {
    coin.removeFromParent()
    state.add("score", 1)
    audio.sfx.coin()
    shake.add(0.15)
  })
})

state.to(PHASES.PLAYING)
engine.start()
\`\`\`

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
