# Fantasy Cards template

This game was created with the immutable `fantasy-cards@1` starter template.
Read root-level `ASSETS.json` before selecting assets or planning a fresh build. The
manifest is the complete local asset inventory and records source provenance.

## Local imports

The common runtime import map already resolves `three` locally. From a root
`game.js` or an inline module in `index.html`, load a model with:

```js
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js"

const loader = new GLTFLoader()
const gltf = await loader.loadAsync("./assets/fantasy-cards/1_Fireball.gltf")
scene.add(gltf.scene)
```

`GLTFLoader.js` and its `SkeletonUtils.js` dependency are seeded locally. Do
not use a CDN, package install, or build step. Each `.gltf` resolves its paired
`.bin` and the shared `Cards_Atlas.png` through relative paths in the same
asset directory; keep those files together and preserve their spelling.

## Gameplay and visual constraints

- Use these models for a readable fantasy card game, spell effects, summons,
  or tabletop scene; do not imply that the pack provides mechanics by itself.
- Preserve the cards' recognizable silhouettes and atlas-backed materials.
  Add UI, board geometry, particles, and lighting in code rather than copying
  unlisted source-pack content.
- The optional stencil portal effect is optional visual polish only. Do not
  make it required for a playable game or use it as a prerequisite for normal
  card gameplay.

## Browser verification contract

A generated Fantasy Cards game must expose the stable hooks declared in root-level
`ASSETS.json` under `verification.requiredSelectors`: `data-numa-ready="true"`
once the game is playable, one or more `data-numa-player-card` and
`data-numa-location` elements, and actions named `data-numa-action="primary"`,
`"end-turn"`, and `"reset"`. These are gameplay hooks, not styling selectors;
keep them stable while changing presentation.

Expose a small read-only `window.__NUMA_VERIFY__` object for the declared
scenarios. It must contain only these safe public fields: `ready`, `phase`,
`lastAction`, `moveCount`, `resetCount`, `selection.cardSelected`,
`selection.locationSelected`, and `hiddenInformation.opponentMovesVisible`.
Start with `phase: "player-turn"` and `moveCount: 0`; selecting a card and
location sets the two selection booleans, primary sets `lastAction: "primary"`,
`phase: "awaiting-end-turn"`, and `moveCount: 1`; end turn sets
`lastAction: "end-turn"` and `phase: "opponent-turn"`; reset returns the initial
phase/count and increments `resetCount` to 1. Never expose card identities,
opponent choices, deck order, or any other hidden move through this adapter.
The harness runs this complete flow at desktop and touch viewports using only
declarative clicks/waits and bounded equality polling. A no-op reset, missing
hook, failed transition, or unsafe hidden-information flag blocks verification.

## Performance guidance

- Load only the models needed for the current scene. Start with a small card
  set and reuse loaded scenes where possible.
- Clone reusable model scenes before placing multiple copies, and share their
  geometry and materials rather than loading duplicate files.
- Keep draw calls, dynamic lights, transparent layers, and post-processing
  modest for an iframe preview. Prefer instanced or procedural board pieces
  over many independently loaded decorative models.
