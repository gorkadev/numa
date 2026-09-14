import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s `math.js` and `input.js` entries (source lines 86-99).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineUtilsSkill: Skill = {
  name: "engine-utils",
  description:
    "Shared math helpers (`math.js`) and polled input state (`input.js`).",
  trigger:
    "A task needs frame-rate-independent easing/damping, seeded randomness or noise, or to read keyboard/mouse/gamepad/pointer state.",
  body: `**math.js** — \`clamp\`, \`lerp\`, \`mapLinear\`, \`degToRad\`, \`radToDeg\`,
\`smoothstep\`, \`smootherstep\`, \`pingpong\`, \`euclideanModulo\`, \`TAU\`;
\`damp(current, target, halfLife, dt)\` and \`dampVec3\`/\`dampAngle\`
(frame-rate independent — use these instead of \`lerp\` in the loop);
\`wrapAngle(angle)\` (wraps into \`(-PI, PI]\`, what \`dampAngle\` uses
internally to turn the short way round); \`rng(seed)\` and the shared
\`random\` with \`.next/.range/.int/.chance/.pick/.shuffle/.onSphere\`;
\`noise2D(seed)\`, \`fbm2D(seed, octaves)\`; \`createTimer(seconds).tick(dt)\`
(returns how many intervals fired) / \`.reset()\`.

**input.js** — \`createInput(engine)\` gives polled state:
\`down(...codes)\`, \`pressed(...)\` (that frame only), \`released(...)\`,
\`axis(neg, pos)\`, \`moveVector()\` (WASD + arrows, normalised),
\`mouseDown/mousePressed/mouseReleased(button)\`, \`pointer.ndc\`, \`delta\`,
\`wheel\`, \`gamepad()\`. Codes are \`event.code\`: \`"KeyW"\`, \`"Space"\`.
\`createPicker(engine, input)\` gives \`pick(objects)\` and
\`pickGround(y)\` for click-to-move and cursor-on-the-floor.`,
}
