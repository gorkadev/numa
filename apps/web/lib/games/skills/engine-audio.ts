import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s `sound.js` entry (source lines 151-157).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineAudioSkill: Skill = {
  name: "engine-audio",
  description:
    "Synthesised sound effects and music (`sound.js`).",
  trigger:
    "A task plays a sound effect, a tone, noise, or generative music.",
  body: `**sound.js** — \`createAudio(engine)\`, all synthesised:
\`sfx.blip/select/jump/land/step/coin/powerup/hit/laser/explosion/lose/win\`,
\`tone({ frequency, endFrequency, type, duration, gain })\`,
\`noise({ duration, frequency, endFrequency })\`,
\`createMusic({ root, scale, bpm }).start()\`, \`setVolume\`, \`toggleMute\`.
Browsers block audio until the player interacts; this resumes itself on the
first click or keypress, so the first sound cannot precede the first input.`,
}
