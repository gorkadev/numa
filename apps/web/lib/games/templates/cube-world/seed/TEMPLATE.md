# Cube World template

This game was created with the immutable `cube-world@1` starter template. Read
root-level `ASSETS.json` before selecting assets or planning a fresh build. The
manifest lists all 107 local glTF models.

## Local imports

The common runtime import map already resolves `three` locally. From a root
`game.js` or an inline module in `index.html`, import the seeded loader only
from this game:

```js
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js"
import { clone } from "./vendor/three/addons/utils/SkeletonUtils.js"

const loader = new GLTFLoader()
const player = await loader.loadAsync("./assets/cube-world/Character_Male_1.gltf")
scene.add(player.scene)
```

Use local imports only. Do not use a CDN, package install, build step, or
unlisted source-pack file. All 107 `.gltf` files are self-contained:
their buffers and textures are embedded. `GLTFLoader.js` and
`SkeletonUtils.js` are vendored locally; the common runtime supplies the local
`BufferGeometryUtils.js` dependency.

## Asset inventory and loading budget

The five original models remain at the root paths shown above and in the manifest:
`Character_Male_1.gltf`, `Goblin.gltf`, `Block_Grass.gltf`, `Tree_1.gltf`, and
`Crystal_Small.gltf`. The other 102 models live under category directories:
`Animals/`, `Blocks/`, `Characters/`, `Enemies/`, `Environment/`,
`Pixel-Blocks/`, and `Tools/`. Filenames retain exact source casing; use each
manifest `path` with a leading `./` for `GLTFLoader.loadAsync`. Search manifest
`category` and `animations` to choose models for your design.

Choose an explicit small eager subset of at most six models needed to make the
initial scene playable. Load optional models lazily on interaction, not at startup;
cache each loaded model so later interactions do not refetch it. The five-model
loop below is an example, not an exclusion of the rest of the pack.

## Example vertical slice

Build one small coherent loop: explore a clearing, collect one crystal, engage
one goblin, attack to victory, then reset. Use the player, goblin, grass block,
tree, and crystal assets for their declared semantic roles. Add simple UI,
lighting, and procedural geometry in code.

Load each chosen model once. For repeated grass blocks or trees, use a bounded
`InstancedMesh` where compatible, or a small fixed clone count. For skinned
player or goblin copies, use `SkeletonUtils.clone`; do not repeatedly fetch or
load the same file. Keep the clearing small and avoid unbounded spawning.

Create an `AnimationMixer` only for an actually declared clip in `ASSETS.json`.
Match clip names exactly, look them up by name, and skip a mixer/action when
that declared clip is unavailable. Do not invent animation names or assume an
undeclared animation has a particular meaning.

## Browser verification contract

A generated Cube World game must expose the stable hooks declared in root-level
`ASSETS.json`: `data-numa-ready="true"` once playable, and actions named
`data-numa-action="collect"`, `"engage"`, `"attack"`, and `"reset"`. These
are gameplay hooks, not styling selectors; keep them stable while changing the
presentation.

Expose a small read-only `window.__NUMA_VERIFY__` object containing only these
public fields: `ready`, `phase`, `crystalCount`, `enemyDefeated`, `lastAction`,
and `resetCount`. Start with `ready: true`, `phase: "explore"`,
`crystalCount: 0`, and `enemyDefeated: false`. Collect sets count to 1 and
`lastAction: "collect"`; engage sets `phase: "encounter"` and
`lastAction: "engage"`; attack sets `phase: "victory"`,
`enemyDefeated: true`, and `lastAction: "attack"`; reset returns the explore
state and increments `resetCount` to 1. The complete declared sequence runs at
both desktop and the 390x844 touch viewport using only declarative actions and
bounded equality polling.

## Source provenance

The user confirmed that the legacy `Cube World - Aug 2023` pack is licensed.
