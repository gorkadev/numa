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
  body: `**sound.js** — \`createAudio(engine, { volume })\`, all synthesised, no
files: \`sfx.blip/select/jump/land/step/coin/powerup/hit/laser/explosion/lose/win\`,
\`tone({ frequency, endFrequency, type, duration, attack, gain, detune, delay, destination })\`,
\`noise({ duration, gain, frequency, endFrequency, type, delay, q })\`,
\`createMusic({ root, scale, bpm, gain }).start()\`/\`.stop()\`, \`setVolume\`,
\`mute\`/\`toggleMute\`, \`unlock\`.
\`delay\` (seconds, on both \`tone\` and \`noise\`) is how chords and arpeggios
are built — schedule several notes at increasing \`delay\` in one call, the
way \`sfx.coin\`/\`sfx.powerup\` stack two or four tones. \`attack\` is the
envelope ramp-up time (seconds); \`detune\` is in cents; \`destination\` lets a
call route around the shared compressor. \`noise\`'s \`type\` is a
\`BiquadFilterNode\` type (\`"lowpass"\` etc.) and \`q\` its resonance.
\`SCALES\` (\`major\`, \`minor\`, \`pentatonic\`, \`minorPentatonic\`) and
\`noteToHz(midiNote)\` (A4 = 69 = 440Hz) are exported for building your own
melodies against \`tone\`.
Browsers block audio until the player interacts: \`createAudio\` starts
suspended and resumes itself on the page's first \`pointerdown\`/\`keydown\`,
so the very first sound of a game can only follow the very first input.`,
}
