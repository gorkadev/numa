# Legacy Fantasy template

This game uses the immutable `legacy-fantasy@1` starter template: the 2D
pixel-art sprites of Anokolisa's Legacy-Fantasy - High Forest 2.3 pack, notes in
`assets/legacy-fantasy/LICENSE.txt`. It is a **2D side-view** template (a
platformer's camera, not top-down): draw everything with the engine's
`sprites.js` and `tilemap.js`, collide with `physics.js`, and give every drawing
task the `engine-2d` skill. There are no glTF models.

Read root-level `ASSETS.json` before choosing art. Every sprite sheet lists its
exact `frameWidth`, `frameHeight`, `frames`, `fps` and, for one-shot animations,
`loop: false`. Take those values from the manifest; never derive them from the
image size. Stills are single frames already trimmed to their art.

## Setup

One tile is 16 px and one world unit: use `pixelsPerUnit: 16` for every sprite
and `tileSize: 16` for the tileset. A `frustumSize` of 14–16 shows a screen of
roughly 25 tiles across. Columns grow to the right (+x) and rows grow downward
(−y): cell `(c, r)` is centred at `(c, −r)`, so the top edge of row `r` is
`−r + 0.5`. Gravity pulls toward −y.

Side view has no y sorting: create every sprite with `ySort: false` and order
the scene with `layer` only (y sorting would draw a jumping hero behind the
ground). Await every texture the first screen uses (`Promise.all` of
`loadPixelTexture`) before `engine.start()`.

## Art at a glance

- `character/`: the hero, one 112x80 frame for every animation: `idle`, `run`,
  `attack`\*, `dead`\*, `jump`\* (all 15 frames), or the same jump split as
  `jump-start`\* (crouch), `jump-air`\* (airborne) and `jump-end`\* (landing).
  `*` plays once.
- `mobs/`: `boar`, `boar-white`, `boar-black` (48x32: `idle`, `walk`, `run`,
  `hit`\*), `bee` (64x64: `fly`, `attack`\*, `hit`\*), `snail` (48x32: `walk`,
  `hide`\* — it retreats into its shell, `dead`\*).
- `terrain/tiles.png`: the 16 px tileset (25x25 cells). Named tiles: the grass
  block and the dirt block (see below). Stills: `rope-bridge`, `bridge-plank`,
  `branch`, `stone-ledge`, `water` (64 px wide, repeats sideways), `waterfall`.
- `trees/<colour>/tree-1..5` (largest to smallest; `tree-1` is 107x368) and
  `silhouette-1..5` (the same trees as flat dark shapes for a background row),
  colours `green`, `dark`, `golden`, `red`, `yellow`.
- `backgrounds/`: `sky` (480x272, a full backdrop), `forest-strip-dark` and
  `forest-strip-light` (96 px wide, repeat sideways seamlessly), `forest-dark`
  and `forest-light` (352 px groups of trees; repeat with gaps).
- `props/`: bushes, canopies, mounds, rocks (`rock-*`, `mossy-rock-*`,
  `standing-stone-*`), mushrooms, flowers, cattails, ferns, vases and pots,
  stakes, a hive.
- `items/`: `coin`, `key`, `gem-blue`, chests (`chest-closed`/`chest-open`,
  `chest-iron-*`, `honey-chest*`), `potion-<large|medium|small>-1..5`, honey
  pieces.
- `buildings/` and `interior/`: doors, a gate, windows, fences, a mine
  entrance, crates, a cage, a shelf.
- `ui/`: see the UI section.

Art faces right; face left with `sprite.flipX = true`. Animations run at 10 fps.

## Anchors: put the feet on the position

Anchor sprites at their feet so a position is where they stand, and physics
bodies (positioned by their feet) line up with the art:

| Art | anchor |
| --- | --- |
| hero (every animation) | `[0.5, 0.2]` |
| boars, snail | `[0.5, 0]` |
| bee (flies) | `[0.5, 0.5]` |
| every still (trimmed) | `[0.5, 0]` on the surface |

The hero's body is about 1.2 units wide and 3 tall: `physics.addBody(hero.object, { size: [1.2, 3, 1] })`.

## Terrain

The grass block is a 5-column kit in the tileset. Rows, top to bottom:
`grass.tuft-*` (blades drawn in the row *above* the surface), `grass.top-*`
(the surface row), `grass.upper-*`, any number of `grass.left|center|right`,
and `grass.bottom-*`. Each row has `-left`, middle and `-right` pieces, e.g.
`grass.top-left`, `grass.top`, `grass.top-right`; the middle tile and the two
after it in the atlas (index +1, +2) are interchangeable, so cycle them for
variety. The dirt block works the same with `dirt.cap-*` (rocks above the
surface), `dirt.top-*`, `dirt.left|center|right` and `dirt.bottom-*`.

The walkable surface is the top edge of the surface row: `−surfaceRow + 0.5`.
Tile layers have no collision of their own; give each block one invisible box
for `physics.addStatic`. Decorations (bridges, rocks, trees) do not collide
either: add a box for any you want to stand on.

Layers, back to front: 0 sky, 1 far forest strip, 2 forest groups and
silhouettes, 3 terrain tiles, 4 props, 5 mobs, 6 hero, 7 foreground bushes.

This code is verified: it draws a forest, two grass blocks with a gap, a dirt
ledge, and a hero who runs, jumps and is followed by the camera with parallax.

```js
import * as THREE from "three"
import { createGame, loadPixelTexture, createSprite, createTileLayer } from "./engine/index.js"

const A = "./assets/legacy-fantasy/"
const PPU = 16
const { engine, input, physics } = createGame({
  orthographic: true, frustumSize: 15, cameraPosition: [12, -5, 10], lookAt: [12, -5, 0],
  shadows: false, antialias: false, background: 0x93e3e4, physics: { gravity: -60 },
})

const files = {
  tiles: "terrain/tiles.png", sky: "backgrounds/sky.png", strip: "backgrounds/forest-strip-dark.png",
  forest: "backgrounds/forest-dark.png", tree: "trees/green/tree-2.png",
  idle: "character/idle.png", run: "character/run.png", air: "character/jump-air.png",
}
const tex = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await loadPixelTexture(A + path)])
))
const manifest = await (await fetch("./ASSETS.json")).json()
const TILES = manifest.tilesets.find((tileset) => tileset.id === "terrain-tiles").tiles

function still(texture, x, y, layer, anchor = [0.5, 0]) {
  const sprite = createSprite(engine, {
    animations: { still: { texture, frameWidth: texture.image.width, frameHeight: texture.image.height } },
    pixelsPerUnit: PPU, anchor, layer, ySort: false,
  })
  sprite.object.position.set(x, y, 0)
  engine.add(sprite.object)
  return sprite
}

const grid = Array.from({ length: 16 }, () => Array(40).fill(null))
function block(kit, c0, surfaceRow, width, height) {
  const rows = kit === "grass"
    ? ["tuft", "top", "upper", ...Array(Math.max(0, height - 3)).fill(""), "bottom"]
    : ["cap", "top", ...Array(Math.max(0, height - 2)).fill(""), "bottom"]
  rows.forEach((part, i) => {
    for (let c = c0; c < c0 + width; c++) {
      const side = c === c0 ? "left" : c === c0 + width - 1 ? "right" : ""
      const index = TILES[`${kit}.${[part, side].filter(Boolean).join("-") || "center"}`]
      grid[surfaceRow - 1 + i][c] = side ? index : index + ((c - c0 - 1) % 3)
    }
  })
  const top = -surfaceRow + 0.5
  const bottom = -(surfaceRow + height - 1) - 0.5
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, top - bottom, 1))
  box.position.set(c0 - 0.5 + width / 2, (top + bottom) / 2, 0)
  box.visible = false
  engine.add(box)
  physics.addStatic(box)
}
block("grass", 0, 10, 14, 6)
block("grass", 18, 10, 20, 6)
block("dirt", 24, 6, 6, 3)
engine.add(createTileLayer({ texture: tex.tiles, tileSize: 16, grid, layer: 3 }).mesh)

const sky = still(tex.sky, 12, -10, 0)
const strips = Array.from({ length: 8 }, (_, i) => still(tex.strip, -6 + i * 6, -10, 1))
const forests = Array.from({ length: 3 }, (_, i) => still(tex.forest, i * 26, -10, 2))
still(tex.tree, 4, -9.5, 4)

const hero = createSprite(engine, {
  animations: {
    idle: { texture: tex.idle, frameWidth: 112, frameHeight: 80, frames: 4 },
    run: { texture: tex.run, frameWidth: 112, frameHeight: 80, frames: 8 },
    air: { texture: tex.air, frameWidth: 112, frameHeight: 80, frames: 8, loop: false },
  },
  pixelsPerUnit: PPU, anchor: [0.5, 0.2], layer: 6, ySort: false,
})
hero.object.position.set(6, -9.5, 0)
engine.add(hero.object)
const body = physics.addBody(hero.object, { size: [1.2, 3, 1] })

engine.onUpdate(() => {
  const move = input.axis("KeyA", "KeyD") + input.axis("ArrowLeft", "ArrowRight")
  body.velocity.x = move * 7
  if (move) hero.flipX = move < 0
  if (input.pressed("Space", "KeyW", "ArrowUp")) physics.jump(body, 4)
  hero.play(!body.grounded ? "air" : move ? "run" : "idle")
})

// Camera follows the hero sideways; backdrop layers move with it at a fraction for depth.
engine.onLateUpdate(() => {
  const x = Math.max(12, hero.object.position.x)
  engine.camera.position.x = x
  sky.object.position.x = x
  strips.forEach((s, i) => { s.object.position.x = -6 + i * 6 + x * 0.8 })
  forests.forEach((s, i) => { s.object.position.x = i * 26 + x * 0.5 })
})
engine.start()
```

Falling into the gap between the blocks is a real fall: check
`hero.object.position.y` against a kill line (e.g. below `−20`) to respawn.

## UI

Prefer an HTML HUD over the canvas (the engine's `hud.js` or plain elements),
with `image-rendering: pixelated`.

- Panels for CSS `border-image`: `ui/panel-paper` (64x64) and `ui/panel-wood`
  (48x48), slice 6:
  `border-style: solid; border-width: 12px; border-image: url(./assets/legacy-fantasy/ui/panel-paper.png) 6 fill / 12px / 0 stretch; image-rendering: pixelated;`
- Buttons: `ui/button-<red|blue|green|yellow|gray>` (58x26).
- Bars: `ui/bar-frame` (58x6) with `ui/bar-fill-<blue|red|green|yellow>`
  (56x4) stretched inside for the value; `-thin` variants of both.
- Icons (16 px): `ui/icon-<pause|close|plus|arrow-up|arrow-down|arrow-left|arrow-right|exclamation|question|home|skull|clock|chest|trophy|player|settings>`;
  inventory slots `ui/slot-<circle|square|diamond>-<tan|green|blue|red|yellow|dark|empty>`;
  `ui/minimap-frame`.

## Example vertical slice: a forest run

Unless the request says otherwise, a good first game is a short side-scrolling
platformer: the hero runs (`run`) with A/D or arrows (and touch), jumps with
Space (`jump-air` while airborne), and swings the sword with J or a tap
(`attack`, one shot, back to idle in `onFinish`). Boars patrol the grass and
charge (`run`) when the hero is near, bees hover on a sine wave, snails `hide`
when hit once and die (`dead`) on the second hit. Coins float over gaps, and
an open chest (`chest-open`) ends the level. A heart bar from `bar-frame` and
`bar-fill-red` sits in a `panel-wood` HUD. Keep the first screen about 25
tiles wide. This is an example, not a restriction: the kit also suits
metroidvania rooms, runners and arena survival.
