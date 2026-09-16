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
loop, yoyo })\`, \`createShake(engine).add(0..1)\`,
\`spin(engine, object, speed)\`, \`float(engine, object)\`, \`popIn\`/\`popOut\`,
\`flash(engine, object)\` (hit feedback),
\`walkCycle(rig, elapsed, speed, { swing, cadence, bob })\` for a
\`createCharacter\` rig, \`createMixer(engine, root, clips)\`.

\`spring(value, { stiffness = 120, damping = 1 })\` — a handle, not a
one-shot: \`.target\` (get/set the value it's chasing), \`.snap(next?)\`
(jumps instantly, defaults to the current target), \`.value\` (current
number), and \`.update(dt)\` which advances the simulation AND returns the
new value — call it every frame or the spring never moves. Lower \`damping\`
below 1 for overshoot/bounce.

**hud.js** — \`createHud(engine, { theme })\`, a styled DOM overlay that never
eats clicks:
\`stat(label, value, position)\` → \`.set(v)\`,
\`bar(label, position, { color, dangerBelow })\` → \`.set(0..1)\`
(\`dangerBelow\`, default 0.3, switches the fill to the danger colour at or
below that fraction),
\`text(content, position)\`, \`keys([{ keys: ["W"], label: "Move" }])\`,
\`crosshair()\`, \`toast(message, duration)\` (seconds before it fades, default 1.8),
\`panel({ title, body, actions: [{ label, onClick, ghost }], pause })\`
(\`pause\`, default true, pauses \`engine\` while the panel is up and resumes
it on close — pass \`false\` for a panel that shouldn't stop the game),
\`follow(object, { offset, content })\` (nameplates), \`theme({ accent })\`, \`clear()\`.
Positions are \`"top|middle|bottom"\`-\`"left|center|right"\`.

\`hud.touch({ stick, look, buttons, show })\` — the on-screen stick, look-drag
and buttons a touch player needs. Needs \`input\` passed to \`createHud(engine,
{ input })\`, since it writes exclusively through \`input.virtual\`. \`stick\`
and \`look\` (each \`"left"\`, \`"right"\` or \`false\`) pick which half of the
screen drives the move stick and which drives the look drag — the stick wins
where the halves overlap. \`buttons\` is \`{ label, code, hold }[]\`: \`code\` is
the key code the button stands for (\`"Space"\`, \`"KeyE"\`), so the game keeps
reading \`input.down(code)\` and never branches on whether the press came from
a key or a tap; \`hold\` makes it behave like a held key instead of a single
\`pressed()\` pulse. \`show\` is \`"auto"\` (default — shown only for a coarse
pointer), \`"always"\` or \`"never"\`. Call it once per game.`,
}
