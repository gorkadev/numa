import type { Skill } from "./registry"

/**
 * 2D on the same engine: the orthographic setup, `sprites.js`,
 * `tilemap.js`, and how the shared modules apply in 2D. Pushed by role to
 * 2D games only (`lib/games/dimension.ts`); a 3D game never sees it.
 */
export const engine2dSkill: Skill = {
  name: "engine-2d",
  description:
    "2D and pixel-art games on the engine: orthographic setup, sprite-sheet animation (`sprites.js`) and tile maps (`tilemap.js`).",
  trigger:
    "The game is 2D or pixel art, a selected template ships sprite sheets or tilesets, or a task draws sprites, animates a sheet, builds a tile map or orders 2D depth.",
  body: `## 2D games on the engine

A 2D game uses the same engine as a 3D one — loop, input, HUD, sound, tweens
and particles all still apply. What changes is the camera and what you draw:
flat sprites and tile layers instead of models and lights.

### Setup

\`\`\`js
const engine = createEngine({
  orthographic: true,
  frustumSize: 12,           // world units visible vertically; 1 unit = 1 tile
  cameraPosition: [0, 0, 10],
  lookAt: [0, 0, 0],
  shadows: false,
  antialias: false,
  background: 0x47aba9,      // fills every pixel no tile covers
})
\`\`\`

The camera looks down −z at the x/y plane: +x is right, +y is up. Move it
with \`engine.camera.position.x/y\` to scroll or follow the player. Skip
\`addLighting\`: sprites and tiles are unlit and show their pixels exactly.
Choose one \`pixelsPerUnit\` for the whole game (the tile size, e.g. 64) so
every sprite keeps its true size relative to the map.

### Textures — sprites.js

- \`loadPixelTexture(url)\` → \`Promise<Texture>\`, cached per URL, already
  set to nearest filtering. Await every texture the first screen needs
  (\`Promise.all\`) before \`engine.start()\`. A texture loaded any other way
  must go through \`pixelArt(texture)\` or it renders blurred.

### Animated sprites — sprites.js

\`createSprite(engine, { animations, animation, pixelsPerUnit, anchor, layer, ySort, onFinish })\`
→ \`{ object, mesh, play(name, { restart }), setFrame(i), flipX, animation, frame, finished, dispose() }\`.

- \`animations\`: one entry per sheet, \`{ texture, frameWidth, frameHeight, frames, fps, loop }\`.
  Sheets are read left to right, top to bottom. Take frame sizes from the
  template manifest — never assume frames are square or as wide as the
  sheet is tall; a wrong size throws instead of slicing garbage.
- Move \`sprite.object\` (not \`mesh\`); add it with \`engine.add(sprite.object)\`.
- \`anchor\` is the point of the frame placed on \`object.position\`, as
  fractions with y up from the bottom: \`[0.5, 0]\` = bottom centre.
  When the art has transparent padding, set the anchor at the character's
  feet so y sorting and collisions use the feet.
- \`play("run")\` every frame is safe; it only restarts on a change.
  One-shot animations (\`loop: false\`) stop on their last frame, set
  \`finished\` and call \`onFinish(name)\` — return to idle there.
- Face left with \`sprite.flipX = true\`; art faces right unless stated.

### Draw order

Everything 2D is painted back to front by \`renderOrder\`, not the depth
buffer. \`setSpriteDepth(object, { layer, y })\`: a higher layer is always in
front; inside a layer a lower y is in front, which is what makes a
top-down scene read (a unit below a tree covers its trunk). Sprites re-sort
themselves from their y every frame (\`ySort\`, default on). Keep z at 0.
Suggested layers: 0 water/background, 1–3 ground and elevation, 5 units,
buildings and props, 8 effects, 9 world-space UI.

### Tile maps — tilemap.js

- \`createTileLayer({ texture, tileSize, tiles, grid, pixelsPerUnit, origin, layer })\`
  → \`{ mesh, cellToWorld(column, row), worldToCell(x, y), dispose() }\`.
  \`grid\` is rows of tile names (from \`tiles\`), atlas indices, or \`null\`;
  row 0 is the top. Cell (c, r) is centred at \`origin + (c, −r)\` in tile
  units. One mesh per layer however big the map: stack layers, do not make a
  mesh per tile.
- \`autotile16(mask, { column, row, columns })\` turns a land mask
  (truthy = land) into atlas indices for a 4x4 block of 16 neighbour pieces
  (3x3 patch, vertical strip, horizontal strip, lone tile), so edges and
  corners come out right. Write the map as a mask and let this pick pieces.
- Tile maps carry no collision. Keep the mask (or a walkable grid) and
  test \`worldToCell\` against it to block movement.

### Movement and collisions — input.js, physics.js

\`input.moveVector()\` maps straight onto the screen plane: \`x\` is right and
\`y\` is up, so \`position.x += v.x * speed * dt\` and
\`position.y += v.y * speed * dt\` (no \`-y\` → z flip as in 3D).

\`physics.js\` works in 2D on the x/y plane with z kept at 0:
- Side view (platformer): \`createPhysics(engine, { gravity: -24 })\` pulls
  bodies down −y. \`addBody(sprite.object, { size: [w, h, 1] })\` — give z
  a thickness of 1; bodies are positioned by their feet, so anchor the
  sprite at \`[0.5, 0]\`.
- Top down: \`createPhysics(engine, { gravity: 0 })\` and drive
  \`body.velocity.x/y\` from input.
- \`addStatic\` measures a mesh's bounds, and a tile layer is one mesh for
  the whole map: never pass a layer. Block movement with the land mask and
  \`worldToCell\`, or add invisible boxes (\`size\` with z 1) for solids.
- \`overlaps(a, b, radius)\`, \`collect\` and \`clampToBounds\` work as is
  (z stays 0; give \`clampToBounds\` z bounds of 0). Do not use
  \`overlapsFlat\`: it ignores y, which is half of a 2D screen.

### What does not apply

\`anim.js\` ships unchanged, but \`walkCycle\` (swings the limbs of a 3D
character rig) and \`createMixer\` (plays glTF/three.js keyframe clips) have
nothing to act on in 2D — animate with sprite sheets instead. \`flash\`
does nothing either (sprites are unlit, with no emissive): for a hit flash
tween \`sprite.mesh.material.color\` instead. \`tween\`, \`spring\`,
\`createShake\`, \`float\` and \`popIn\`/\`popOut\` work on \`sprite.object\`.
There are no models, lights or camera rigs.

### Readiness

Load textures, build the layers and sprites, then \`engine.start()\`. When the
template asks for the readiness flag, set it only after every
\`loadPixelTexture\` promise resolved.`,
}
