# Platformer template

This game uses the immutable `platformer@1` starter template: the glTF models of
Quaternius' Ultimate Platformer Pack (CC0, see `assets/platformer/License.txt`).
Read root-level `ASSETS.json` before choosing models. It lists all 109 models with
a `category` (player, enemy, platform, hazard, mechanism, pickup, vegetation,
prop, structure), exact animation clip names, and `bounds`: the model's box in
its own units, after node transforms. Use the bounds to place and scale models
instead of guessing.

## Local imports

The common runtime import map resolves `three` locally. Use the seeded loaders
from a root `game.js` or an inline module in `index.html`:

```js
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js"
import { clone } from "./vendor/three/addons/utils/SkeletonUtils.js"

const loader = new GLTFLoader()
const hero = await loader.loadAsync("./assets/platformer/Character/Character.gltf")
```

Use local imports only: no CDN, package install, build step, or unlisted pack
files. Every model embeds its buffer except
`Platforms/3D/Cube_Dirt_Center_Tall.gltf`, whose `.bin` sits next to it. No
model uses textures; colors are materials. Keep exact filename casing.

## Units, origins and facing

- The level is a 2-unit grid. Cubes and platform tiles are centered on their
  origin and span -1..1, so a tile at grid cell `(col, row)` goes at
  `(col * 2, row * 2, 0)` and its walkable top is at `row * 2 + 1`.
- Characters and enemies have their origin at their feet. `Character.gltf` is
  3.76 units tall and 3.4 wide with arms out: scale it to about 0.5 so it stands
  one cell tall. `Enemy.gltf` is 1.6 tall, `Crab.gltf` 1.5, `Skull.gltf` 1.5;
  `Bee.gltf` is a flyer.
- Every character and enemy faces +Z. In a side view, `rotation.y = Math.PI / 2`
  faces right (+X) and `-Math.PI / 2` faces left (-X).
- Pickups (`Coin`, `Gem_*`, `Heart*`, `Star*`, `Key`, `Thunder`) are centered on
  their origin, not on their base. `Coin` is 1.92 wide: scale it to about 0.4.
- `Mechanics/Stairs.gltf` is a ladder (2 tall, 0.26 deep). `Stairs_Small` and
  `Stairs_Modular_*` are wooden stair segments.
- Skinned models (characters, enemies, `Chest`, `Lever`, `Bouncer`,
  `Hazard_SpikeTrap`) must be copied with `SkeletonUtils.clone`. A plain
  `object.clone()` keeps the original skeleton and the copy renders at the
  original's position.

## Platform tiles

The pack has four tile systems. Use one system per platform; do not mix them.

- **Side-scroller rows** (`Platforms/2D/`): `Cube_Grass_1x1Center` repeated,
  capped by `Cube_Grass_1x1End`. The End's grass lip overhangs -X, so it caps the
  left end as is and the right end with `rotation.y = Math.PI`. The `Cube_Dirt_*`
  pieces of the same folder fill the rows below. `Cubes/Cube_Grass_Single` is a
  one-cell island.
- **Flat 3D platforms** (`Platforms/Single-Height/`): `Cube_Grass_Center` inside,
  `Cube_Grass_Side` on the edges, `Cube_Grass_Corner` on the corners. Side
  overhangs +Z: rotate it `0` for a +Z edge, `Math.PI / 2` for +X, `Math.PI` for
  -Z, `-Math.PI / 2` for -X. Corner overhangs -X and +Z: rotate it `0` for the
  (-X, +Z) corner, `Math.PI / 2` for (+X, +Z), `Math.PI` for (+X, -Z) and
  `-Math.PI / 2` for (-X, -Z).
- **Tall 3D platforms** (`Platforms/3D/`): the same layout stacked in layers,
  with the same rotations. `Cube_Grass_Center_Tall` and `Cube_Grass_Bottom_Tall`
  are single flat quads (the top and bottom caps), not cubes.
- **Loose blocks** (`Cubes/`): crates, bricks, `?` and `!` blocks, and
  `Cube_Spikes` (a hazard, 3.15 wide with its spikes).

`Nature/RockPlatform*` are large decorative rock mesas; read their bounds before
using one as ground.

## Gameplay: no physics included

The pack has no physics, collision, or game logic: write them in code. Keep a
logical tile grid as the source of truth for collision and test the player's
box against it (gravity, ground check, wall stops, head bumps), rather than
colliding against meshes. Size hit boxes from the manifest `bounds` times the
scale you applied.

Animated props play one-shot clips: set `LoopOnce` and
`clampWhenFinished = true` for `Chest_Open`/`Chest_Close`, `Lever_On`/`Lever_Off`,
`Bouncer_Bounce` and `SpikeTrap_Activate`; `Bouncer_Idle` loops. Character clips
include `Idle`, `Walk`, `Run`, `Jump`, `Jump_Idle`, `Jump_Land`, `HitReact` and
`Death`. Enemy clips include `Idle`, `Walk`, `Death` and `HitRecieve` (the source
spells it that way). `Bee` has `Flying`, `Bite_Front`, `HitRecieve` and `Death`.
Look clip names up in `ASSETS.json`; never invent one.

`Numbers_0` to `Numbers_9` are 3D digits for in-world signs; a DOM HUD is simpler
for scores. `Heart`, `Heart_Half`, `Heart_Outline` and the `Star` pair suit
lives and ratings.

## Example vertical slice: a 2.5D side-scroller

Unless the user asks for something else, build a side-scroller: gameplay on the
z = 0 plane, a perspective camera at a fixed distance on +Z that follows the
player along X. One short level: run and jump across `Platforms/2D` rows,
collect coins, stomp one `Enemy` (jump on it; touching it from the side hurts),
reach `Goal_Flag`, then reset. This is an example, not a restriction on assets
or genre.

Eager-load at most six models for the first playable screen, for example
`character`, `cube-grass-1x1center`, `cube-grass-1x1end`, `coin`, `enemy` and
`goal-flag`. Load anything else lazily and cache it. Load each file once and
clone it for repeats; keep spawning bounded. Support keyboard (arrows or A/D,
Space to jump) and touch (on-screen left, right and jump buttons), and show
clear ready, win, lose, and restart states.
