# Toon Shooter template

This game uses the immutable `toon-shooter@1` starter template. Read root-level
`ASSETS.json` before choosing models. All 74 source glTF models are available:
3 Characters, 55 Environment models, and 16 Guns. This is the complete glTF
pack, not a curated subset. Redundant Blender, FBX, and OBJ files are excluded.

## Local imports

The common runtime import map resolves `three` locally. Use the seeded loaders
from a root `game.js` or an inline module in `index.html`:

```js
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js"
import { clone } from "./vendor/three/addons/utils/SkeletonUtils.js"

const loader = new GLTFLoader()
const soldier = await loader.loadAsync("./assets/toon-shooter/Characters/Character_Soldier.gltf")
scene.add(soldier.scene)
```

Use local imports only: no CDN, package install, build step, or unlisted pack
files. The existing r185 GLTFLoader and SkeletonUtils are vendored unchanged;
the common runtime supplies BufferGeometryUtils. Every model embeds its buffer
and textures (images use buffer views); no external buffer or texture files
are required. Keep exact filename casing and use manifest paths prefixed by `./`.

## Loading budget and gameplay

Choose a small eager subset of at most six models for the initial playable
scene. Load optional models lazily on interaction and cache them. Availability
of the entire inventory is not a request to load everything at startup.

One possible vertical slice is a small arena with Character_Soldier,
Character_Enemy, Pistol, Barrier_Single, and Health: move, aim, defeat an enemy,
collect health, then reset. Use simple procedural geometry for the floor and
bounded spawning. These are examples, not restrictions on asset selection.
Keep controls usable with keyboard/pointer and touch; expose clear ready,
victory, and restart states.

Load each selected model once. Use bounded instances or clones for repeated
scenery and SkeletonUtils.clone for skinned characters. Create AnimationMixers
only for declared clips. Look up exact animation names in ASSETS.json; skip
missing actions rather than inventing clip names. Weapon models do not imply
built-in firing, damage, physics, or attachment logic: implement those in code.

## Source provenance

The user confirmed that the legacy `Toon Shooter Game Kit - Dec 2022` pack is licensed.
