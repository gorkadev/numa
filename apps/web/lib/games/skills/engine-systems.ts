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
  body: `**fx.js** — \`addBloom(engine, { strength, radius, threshold })\` → \`{
composer, bloom, disable() }\` (threshold is pre-tone-mapping, so ~1.1 blooms
only \`glow()\` materials; dropping it below 0.9 hazes the whole picture;
\`disable()\` reverts to plain rendering, e.g. for a low-quality toggle).
\`createParticles(engine, { count, size, color, gravity, drag, lifetime })\`
(\`size\` is point size, \`drag\` an exponential per-second velocity decay) →
\`.burst(position, amount, { speed, spread, color })\` (\`spread\` scales the
horizontal velocity only, for a flatter/wider burst) and \`.dispose()\`.
\`shockwave(engine, position, { color, duration, maxRadius, orientation })\`
(\`duration\` in seconds; \`orientation: "ground"\` lays the ring flat, anything
else leaves it facing the camera) — returns the ring mesh.
\`createTrail(engine, object, { length, color, width })\`.

**state.js** — \`createGameState(engine, { values, phase, saveKey, persist })\`:
\`phase\`, \`to(PHASES.PLAYING, detail?)\` (drives \`engine.pause\`/\`resume\`,
no-op if already in that phase), \`on(phaseName, fn)\` (\`"*"\` for every
transition), \`get(key)\`/\`set(key, v)\`/\`add(key, n)\`, \`watch(key, fn)\`
(fires immediately, then on change), \`reset()\` (values back to the initial
ones, without touching \`best\`), \`best\`, \`save(data)\`/\`load()\`,
\`isPlaying\`. \`PHASES\` = menu, playing, paused, over, won.

**index.js** — re-exports all of the above, plus \`createGame({ lighting,
environment, physics, state, audio, hud, ...engineOptions })\` — \`audio\` and
\`hud\` are passed straight through to \`createAudio\`/\`createHud\` (e.g.
\`audio: { volume }\`, \`hud: { theme }\`); \`physics\`/\`state\` are only built
when their option object is given (\`null\`/omitted skips them). Returns
\`{ engine, input, picker, lights, hud, audio, shake, physics, state }\`. It
does **not** start the loop: build the world first, then call
\`engine.start()\`.`,
}
