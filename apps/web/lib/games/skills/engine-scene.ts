import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s `lighting.js` and `models.js` entries (source lines 120-133).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineSceneSkill: Skill = {
  name: "engine-scene",
  description:
    "Scene dressing: lighting presets (`lighting.js`) and the built-in prop/character factories (`models.js`).",
  trigger:
    "A task adds lights, sky, or environment reflections, or spawns characters, props, or ground from the toolkit's model factories.",
  body: `**lighting.js** — \`addLighting(engine, "day"|"sunset"|"night"|"studio"|"neon")\`
returns \`{ sun, hemisphere, followTarget(object, engine) }\` — call
\`followTarget\` in a large world or shadows stop at the starting area.
\`createGradientSky(engine, top, bottom)\`, \`addEnvironment(engine, intensity)\`
(reflections for metal), \`attachLight(engine, object, { color, intensity, flicker })\`.

**models.js** — everything returns a \`THREE.Group\` with shadows set:
\`createCharacter({ color, skin, height })\` (rigged: \`.parts.head/torso/armL/armR/legL/legR\`),
\`createCrate\`, \`createCoin\`, \`createTree\`, \`createRock\`, \`createGround({ size, cell })\`,
\`createPlatform(w, d, h, color)\`, \`createLabel(text, { color, scale })\` (text as a
sprite — the only way to show words in the world), \`createField(geometry, material,
count, place)\` (instanced: use it past a few hundred copies).
Materials: \`matte\`, \`glossy\`, \`metal\`, \`glow(color, intensity)\`, \`toon(color, steps)\`.
Colours: \`PALETTE\` and \`PALETTE_SEQUENCE\`.`,
}
