import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s `anim.js` and `hud.js` entries (source lines 135-149).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineFeedbackSkill: Skill = {
  name: "engine-feedback",
  description:
    "Tweening and juice (`anim.js`) and the DOM HUD overlay (`hud.js`).",
  trigger:
    "A task animates an object, adds camera shake, or shows score, health, prompts, or toasts to the player.",
  body: `**anim.js** — \`easing\` (\`outCubic\` is the safe default, \`outBack\` for
arrivals), \`tween(engine, { duration, from, to, ease, onUpdate, onComplete,
loop, yoyo })\`, \`spring(value, { stiffness })\`, \`createShake(engine).add(0..1)\`,
\`spin(engine, object, speed)\`, \`float(engine, object)\`, \`popIn\`/\`popOut\`,
\`flash(engine, object)\` (hit feedback),
\`walkCycle(rig, elapsed, speed)\` for a \`createCharacter\` rig,
\`createMixer(engine, root, clips)\`.

**hud.js** — \`createHud(engine)\`, a styled DOM overlay that never eats clicks:
\`stat(label, value, position)\` → \`.set(v)\`, \`bar(label, position)\` → \`.set(0..1)\`,
\`text(content, position)\`, \`keys([{ keys: ["W"], label: "Move" }])\`,
\`crosshair()\`, \`toast(message)\`,
\`panel({ title, body, actions: [{ label, onClick, ghost }] })\` (pauses while open),
\`follow(object, { offset, content })\` (nameplates), \`theme({ accent })\`, \`clear()\`.
Positions are \`"top|middle|bottom"\`-\`"left|center|right"\`.`,
}
