import type { Skill } from "./registry"

/**
 * Moved verbatim from `instructions/engine.ts`'s intro, "Loading it", and the `engine.js` entry under "The toolkit" (source lines 21-84).
 *
 * The body is moved verbatim, not rewritten: it is the same reference text
 * every worker already relied on when it was always-loaded, just scoped to
 * one topic so a role's defaults (`registry.ts`) can pull only what it
 * needs.
 */
export const engineCoreSkill: Skill = {
  name: "engine-core",
  description:
    "Engine setup: the vendored-Three.js import map and the core `engine.js` render loop API.",
  trigger:
    "A task touches `index.html`'s import map, or calls `createEngine`, `engine.onUpdate`/`onFixedUpdate`/`onLateUpdate`, `engine.add`, or any other core loop method.",
  body: `## The game engine

Every sandbox starts with Three.js r185 and a small game toolkit already on
disk. Use them. Writing a render loop, a camera rig or a collision routine by
hand is a slower path to a worse result, and the toolkit is the part of the
game you do not have to debug.

### Loading it

Three.js is vendored locally — there is no network — and reached through an
import map that must live in \`index.html\`. Every game needs these lines:

\`\`\`html
<script type="importmap">
  {
    "imports": {
      "three": "./vendor/three/three.module.min.js",
      "three/addons/": "./vendor/three/addons/"
    }
  }
</script>
<script type="module" src="./game.js"></script>
\`\`\`

An import map only works in the document that loads the modules; one inside a
\`.js\` file does nothing. If you rewrite \`index.html\`, carry it over.

Only these addons exist under \`three/addons/\` — importing any other is a 404
and a blank screen:

\`controls/OrbitControls.js\`, \`controls/PointerLockControls.js\`,
\`loaders/SVGLoader.js\`, \`geometries/RoundedBoxGeometry.js\`,
\`math/ImprovedNoise.js\`, \`utils/BufferGeometryUtils.js\`,
\`environments/RoomEnvironment.js\`, and the post-processing set
(\`EffectComposer\`, \`RenderPass\`, \`ShaderPass\`, \`OutputPass\`,
\`UnrealBloomPass\`, plus the shaders they need).

There is no GLTF, texture or audio file to load, and no loader for one. Every
model, sound and texture is generated in code.

### The toolkit

\`\`\`js
import { createGame, createGround, PALETTE } from "./engine/index.js"
\`\`\`

\`engine/\` and \`vendor/\` are a library: read them when you need detail, build
on top of them in your own files, and do not rewrite or delete them.

**engine.js** — renderer, scene, camera, loop.
- \`createEngine({ mount, background, fog, fogRange, fov, near, far,
  cameraPosition, lookAt, orthographic, frustumSize, shadows, antialias,
  maxPixelRatio, fixedStep })\`
- The engine handles pixel ratio, resizing, tab visibility, WebGL context
  loss, and shows uncaught errors on screen instead of freezing.
- \`engine.onUpdate(fn(dt, engine))\` — game logic. \`dt\` is clamped seconds.
- \`engine.onFixedUpdate(fn)\` — physics, at a fixed rate.
- \`engine.onLateUpdate(fn)\` — cameras, after everything has moved.
- \`engine.onResize(fn({ width, height, aspect }))\`, \`engine.onDispose(fn)\`
- \`engine.add(...objects)\`, \`.remove()\`, \`.start()\`, \`.stop()\`,
  \`.pause()\`, \`.resume()\`, \`.dispose()\`, \`.fail(error)\`
- \`engine.scene\`, \`.camera\`, \`.renderer\`, \`.canvas\`, \`.mount\`, \`.size\`,
  \`.dt\`, \`.elapsed\`, \`.paused\`
- \`disposeObject(object)\` — frees geometry, materials and textures.`,
}
