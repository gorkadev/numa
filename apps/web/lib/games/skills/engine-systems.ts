import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s `fx.js`, `state.js`, and `index.js` entries (source lines 159-175).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineSystemsSkill: Skill = {
  name: "engine-systems",
  description:
    "Post-processing/particle effects (`fx.js`), game-state and phase management (`state.js`), and the `createGame` composition helper (`index.js`).",
  trigger:
    "A task adds bloom, particles, or trails; needs a phase machine (menu/playing/paused/over/won) with save data; or wires the toolkit's pieces together via `createGame`.",
  body: `**fx.js** — \`addBloom(engine, { strength, radius, threshold })\` (threshold is
pre-tone-mapping, so ~1.1 blooms only \`glow()\` materials; dropping it below
0.9 hazes the whole picture), \`createParticles(engine, { count, color, gravity,
lifetime }).burst(position, amount, { speed, color })\`,
\`shockwave(engine, position, { color, maxRadius })\`,
\`createTrail(engine, object, { length, color })\`.

**state.js** — \`createGameState(engine, { values, saveKey, persist })\`:
\`phase\`, \`to(PHASES.PLAYING)\` (drives \`engine.pause\`/\`resume\`),
\`on(phase, fn)\`, \`get\`/\`set\`/\`add(key, n)\`, \`watch(key, fn)\`, \`reset()\`,
\`best\`, \`save(data)\`/\`load()\`. \`PHASES\` = menu, playing, paused, over, won.

**index.js** — re-exports all of the above, plus
\`createGame({ lighting, environment, physics, state, ...engineOptions })\`
which builds engine, input, picker, lighting, HUD, audio and shake in one call
and returns them. It does **not** start the loop: build the world first, then
call \`engine.start()\`.`,
}
