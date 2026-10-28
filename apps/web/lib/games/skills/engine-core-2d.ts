import type { Skill } from "./registry"

/**
 * `engine-core` for a 2D sandbox. The 3D text promises that no texture is
 * ever loaded and imports `models.js`, neither of which is true of a 2D
 * game: its art is the template's sprite sheets and its sandbox has no
 * models, lighting or controls modules. The import map and the core loop
 * are the same engine, so those parts keep the 3D wording.
 */
export const engineCore2dSkill: Skill = {
  name: "engine-core-2d",
  description:
    "Engine setup for a 2D game: the vendored-Three.js import map, the 2D toolkit import and the core `engine.js` render loop API.",
  trigger:
    "A task touches `index.html`'s import map, or calls `createGame`, `createEngine`, `engine.onUpdate`/`onFixedUpdate`/`onLateUpdate`, `engine.add`, or any other core loop method.",
  body: `## The game engine (2D)

Every sandbox starts with Three.js r185 and a small 2D game toolkit already
on disk. Use them. Writing a render loop, a sprite animator or a collision
routine by hand is a slower path to a worse result, and the toolkit is the
part of the game you do not have to debug.

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

The art is the selected template's sprite sheets and tilesets, listed in
\`ASSETS.json\`: load them with \`loadPixelTexture\` (engine-2d). There are no
3D models, lights or camera rigs in a 2D sandbox — \`engine/\` has no
\`models.js\`, \`lighting.js\` or \`controls.js\`, and importing one is a 404 and
a blank screen. Sound is generated in code.

### The toolkit

\`\`\`js
import { createGame, createSprite, createTileLayer, loadPixelTexture } from "./engine/index.js"

const { engine, input, hud, audio } = createGame({
  orthographic: true,
  frustumSize: 12,
  cameraPosition: [0, 0, 10],
  lookAt: [0, 0, 0],
  shadows: false,
  antialias: false,
})
\`\`\`

\`createGame(options)\` builds engine, input, HUD, audio and a camera shake,
plus \`physics\` and \`state\` when their options are given, and returns them
not started; every other option goes to \`createEngine\`. It adds no lighting:
sprites and tiles are unlit.

\`engine/\` and \`vendor/\` are a library: build on top of them in your own
files, and do not rewrite or delete them. What follows and the API index are
their reference — reach for \`load_skill\` before their source.

**engine.js** — renderer, scene, camera, loop.
- \`createEngine({ mount, background, fog, fogRange, fov, near, far,
  cameraPosition, lookAt, orthographic, frustumSize, shadows, antialias,
  maxPixelRatio, fixedStep })\` — \`mount\` defaults to the page's \`#app\`
  when it has a height, else \`body\`; pass it explicitly when the canvas
  belongs somewhere else.
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
- \`disposeObject(object)\` — frees geometry, materials and textures.

### Input: one abstraction, keyboard and touch both feed it

Read input only through \`input.moveVector()\`, \`input.axis()\`,
\`input.down/pressed/released()\`, \`input.pointer\`, \`input.delta\`. Never
attach a raw \`keydown\` or \`pointerdown\` listener for gameplay — that is the
one thing that breaks touch support, because the touch layer feeds these same
abstractions and nothing else. A key you read through a listener instead of
\`input.down()\` is a key a thumb can never press.

Declare touch controls once, if the game wants them, with \`hud.touch({
stick, look, buttons, show })\`: \`stick\` and \`look\` pick which half of the
screen drives movement and camera look (\`"left"\`, \`"right"\` or \`false\` to
skip one), and \`buttons\` is a list of \`{ label, code, hold }\` — an on-screen
button is declared with the key code it stands for, so the game keeps asking
\`input.down("Space")\` and the same line of code works from a keyboard and a
thumb.`,
}
