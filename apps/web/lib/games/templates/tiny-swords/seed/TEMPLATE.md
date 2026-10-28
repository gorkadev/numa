# Tiny Swords template

This game uses the immutable `tiny-swords@1` starter template: the 2D pixel-art
sprites of Pixel Frog's Tiny Swords (Free Pack), terms in
`assets/tiny-swords/LICENSE.txt`. It is a **2D** template: draw everything with
the engine's `sprites.js` and `tilemap.js` and give every drawing task the
`engine-2d` skill. There are no glTF models.

Read root-level `ASSETS.json` before choosing art. Every sprite sheet lists its
exact `frameWidth`, `frameHeight`, `frames`, `fps` and, for one-shot animations,
`loop: false`. Take those values from the manifest; never derive them from the
image size (trees are 192x256 frames, not square).

## Setup

One tile is 64 px and one world unit: use `pixelsPerUnit: 64` for every sprite.

```js
import {
  createEngine, loadPixelTexture, createSprite, createTileLayer, autotile16,
} from "./engine/index.js"

const A = "./assets/tiny-swords/"
const engine = createEngine({
  orthographic: true, frustumSize: 12, cameraPosition: [0, 0, 10], lookAt: [0, 0, 0],
  shadows: false, antialias: false,
  background: 0x47aba9, // the water colour: every pixel no tile covers is sea
})
```

Await every texture the first screen uses (`Promise.all` of
`loadPixelTexture`) before `engine.start()`. Columns grow to the right (+x) and
rows grow downward (−y): cell `(c, r)` is centred at `(c, −r)`.

## Art at a glance

- `units/<colour>/<unit>/<animation>.png`, colours `blue`, `red`, `yellow`,
  `purple`, `black` (one per faction). 192x192 frames, except `lancer` at
  320x320. Animations (`*` plays once):
  - `warrior`: idle, run, guard, attack1\*, attack2\*
  - `archer`: idle, run, shoot\*, plus `arrow.png` (a still 64x64 projectile)
  - `lancer`: idle, run, and `<dir>-attack`\* / `<dir>-defence` for `up`,
    `up-right`, `right`, `down-right`, `down` (flip for the left side)
  - `monk`: idle, run, heal\*, heal-effect (draw it over the healed unit)
  - `pawn` (worker): idle, run, `idle-<tool>`, `run-<tool>` for axe, gold,
    hammer, knife, meat, pickaxe, wood (carrying it), and `interact-<tool>`
    for axe, hammer, knife, pickaxe (working)
- `buildings/<colour>/`: castle, tower, house1–3, barracks, archery, monastery
  (stills).
- `resources/`: tree-1..4 (swaying), stump-1..4, gold, gold-stone-1..6 with
  `-highlight` sheets, sheep-idle/move/grass, meat, wood, tool-1..4.
- `decorations/`: bush-1..4, rock-1..4, water-rock-1..4 (bobbing), cloud-1..8,
  rubber-duck.
- `effects/`: dust-01/02\*, explosion-01/02\*, water-splash\*, fire-01..03.
- `ui/`: see the UI section.

Art faces right; face left with `sprite.flipX = true`. Animations run at 10 fps.

## Anchors: put the feet on the position

Frames carry a lot of transparent margin. Anchor each sprite at its feet so y
sorting and collisions work from where it stands:

| Art | anchor |
| --- | --- |
| warrior, archer, monk, pawn | `[0.5, 0.29]` |
| lancer | `[0.5, 0.38]` |
| trees, stumps, buildings | `[0.5, 0.06]` (castle and monastery `0.03`) |
| sheep, gold stones, bushes, small props | `[0.5, 0.36]` |

## Building the island

The terrain is layered, bottom to top. This code is verified: it draws seamless
coasts, cliffs and stairs from two masks.

1. **Water**: the engine background colour.
2. **Foam**: `terrain/water-foam.png` (192x192, 16 frames) centred on every land
   cell touching water, layer 0, each with a different start `frame`.
3. **Flat ground**: `autotile16(land, { column: 0, row: 0, columns: 9 })`.
4. **Shadow**: `terrain/shadow.png` (192x192, still) centred one cell *below*
   every elevated cell, layer 2.
5. **Elevated ground**: `autotile16(high, { column: 5, row: 0, columns: 9 })`,
   plus a cliff face in the cell under each elevated cell whose own lower
   neighbour is not elevated: `cliff.*` (41–44) when that cell is land,
   `cliff-water.*` (50–53) when it is water; left/middle/right/single by the
   cliff row's own neighbours.
6. **Stairs**: an overlay layer drawn *over* the intact elevated edge tile and
   the cliff under it: `stairs-left.top` (36) on the edge cell and
   `stairs-left.bottom` (45) on the cliff cell; `stairs-right.*` (39, 48) the
   same way. Never replace the tiles under the stairs: the stair art is
   partly transparent.
7. **Everything standing**: units, trees, buildings, props on layer 5, y-sorted.

Five colour tilesets (`terrain-color1`..`5`) share the same tile names; use a
different one per elevation level so levels read apart.

```js
const land = ["..#####..", ".#######.", ".#######.", "..#####.."].map((r) => [...r].map((c) => c === "#"))
const high = ["........." , "..###....", ".........", "........."].map((r) => [...r].map((c) => c === "#"))
const [flatTiles, highTiles, foam, shadow] = await Promise.all([
  "terrain/tilemap-color1.png", "terrain/tilemap-color2.png", "terrain/water-foam.png", "terrain/shadow.png",
].map((path) => loadPixelTexture(A + path)))

const water = (r, c) => !land[r]?.[c]
land.forEach((row, r) => row.forEach((isLand, c) => {
  const coast = [-1, 0, 1].some((dr) => [-1, 0, 1].some((dc) => water(r + dr, c + dc)))
  if (!isLand || !coast) return
  const s = createSprite(engine, {
    animations: { foam: { texture: foam, frameWidth: 192, frameHeight: 192, frames: 16, fps: 10 } },
    layer: 0, ySort: false, frame: (r * 7 + c * 3) % 16,
  })
  s.object.position.set(c, -r, 0)
  engine.add(s.object)
}))

engine.add(createTileLayer({ texture: flatTiles, tileSize: 64, grid: autotile16(land, { column: 0, row: 0, columns: 9 }), layer: 1 }).mesh)

const cliffs = high.map((row) => row.map(() => null))
high.forEach((row, r) => row.forEach((isHigh, c) => {
  if (!isHigh) return
  const s = createSprite(engine, { animations: { s: { texture: shadow, frameWidth: 192, frameHeight: 192 } }, layer: 2, ySort: false })
  s.object.position.set(c, -(r + 1), 0)
  engine.add(s.object)
  if (high[r + 1]?.[c]) return
  const left = row[c - 1] && !high[r + 1]?.[c - 1]
  const right = row[c + 1] && !high[r + 1]?.[c + 1]
  cliffs[r + 1][c] = (land[r + 1]?.[c] ? 41 : 50) + (left ? (right ? 1 : 2) : right ? 0 : 3)
}))
engine.add(createTileLayer({ texture: highTiles, tileSize: 64, grid: autotile16(high, { column: 5, row: 0, columns: 9 }), layer: 3 }).mesh)
engine.add(createTileLayer({ texture: highTiles, tileSize: 64, grid: cliffs, layer: 3 }).mesh)
```

Walking: flat land and elevated tops are walkable; cliff cells and water are
not; a stairs column connects the two levels. Keep the masks and test
`worldToCell` against them — tile layers have no collision of their own.

## UI

Prefer an HTML HUD over the canvas (the engine's `hud.js` or plain elements).

- Stills to use as-is: `ui/icon-01..12` (64x64), `ui/avatar-01..25`
  (256x256 portraits), `ui/cursor-1..4`, small and tiny buttons
  (`ui/small-<colour>-<round|square>-button-<regular|pressed>`,
  `ui/tiny-<round|square>-<colour>-button`), `ui/banner-slots`,
  `ui/wood-table-slots`.
- Stretchable panels, repacked without gaps for CSS `border-image`, corner
  size in brackets: `ui/regular-paper`, `ui/special-paper`, the four
  `ui/big-<blue|red>-button-<regular|pressed>` [64]; `ui/banner`,
  `ui/wood-table` [128]. Example:
  `border-style: solid; border-width: 32px; border-image: url(./assets/tiny-swords/ui/regular-paper.png) 64 fill / 32px / 0 stretch; image-rendering: pixelated;`
- Bars: `ui/big-bar-base` / `ui/small-bar-base` are three 64 px pieces (left,
  middle, right) in one 192x64 image (`border-image-slice: 0 64 fill`); stretch
  `ui/big-bar-fill` / `ui/small-bar-fill` inside for the value.
- `ui/big-ribbons` (320x128 rows), `ui/swords` (320x128 rows) and
  `ui/small-ribbons` (192x64 rows) hold one row per colour in the order blue,
  red, yellow, purple, black (small ribbons: two rows per colour, notched ends
  then pointed ends). Each row is a left/middle/right strip.

## Example vertical slice: an island skirmish

Unless the request says otherwise, a good first game is a small top-down
island: the player moves a blue warrior with WASD/arrows (and touch), `play`s
`run` while moving and `idle` otherwise, attacks with Space (`attack1`, one
shot, back to idle in `onFinish`), and fights red warriors that walk toward
it from the other side of the island. Defeated enemies leave a `dust-01`
puff; pawns chop trees (`interact-axe`) for wood shown in a paper HUD panel.
Keep the first screen to the island in view, about 12–16 tiles wide. This is
an example, not a restriction: the kit also suits tower defence, RTS-lite
gathering and builders.
