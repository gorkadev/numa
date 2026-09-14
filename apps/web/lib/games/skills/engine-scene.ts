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
  body: `**lighting.js** — \`addLighting(engine, "day"|"sunset"|"night"|"studio"|"neon",
{ shadowRadius, shadowMapSize, applyBackground })\` →
\`{ sun, hemisphere, followTarget(object, engine), dispose() }\`.
\`shadowRadius\` (default 30) sizes the directional shadow camera's box —
too small and shadows vanish past the starting area. Either set it to cover
the whole play area, or call \`.followTarget(player, engine)\` to recenter the
shadow box on a moving target every frame instead of sizing it for the whole
level. \`shadowMapSize\` (default 2048) is the shadow texture resolution.
\`applyBackground\` (default true) — set false to keep a custom scene
background instead of the preset's.
\`createGradientSky(engine, top, bottom)\`, \`addEnvironment(engine, intensity)\`
(reflections for metal), \`attachLight(engine, object, { color, intensity, distance, offset, flicker })\`.

**models.js** — everything returns a \`THREE.Group\` with shadows already set
via \`castShadows(object, cast = true, receive = true)\` (call it yourself on
anything you build by hand):
\`createCharacter({ color, skin, accent, height })\` (\`accent\` colors the legs;
rigged: \`.parts.head/torso/armL/armR/legL/legR\`),
\`createCrate\`, \`createCoin\`, \`createTree\`, \`createRock\`,
\`createGround({ size, color, lineColor, cell })\` (\`color\` is the tile fill,
\`lineColor\` the grid stroke — any CSS color string),
\`createPlatform(w, d, h, color)\`, \`createLabel(text, { color, scale })\` (text as a
sprite — the only way to show words in the world), \`createField(geometry, material,
count, place)\` (instanced: use it past a few hundred copies).
Materials: \`matte\`, \`glossy\`, \`metal\`, \`glow(color, intensity)\`, \`toon(color, steps)\`.
Colours: \`PALETTE\` and \`PALETTE_SEQUENCE\`.`,
}
