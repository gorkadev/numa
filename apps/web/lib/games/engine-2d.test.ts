import assert from "node:assert/strict"
import * as nodeModule from "node:module"
import { test } from "node:test"

// The installed runtime supports synchronous hooks; bundled Node types predate them.
type Resolve = (specifier: string, context: object) => { url: string }
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (specifier: string, context: object, next: Resolve) => { url: string }
  }) => void
}
// In a game, "three" comes from the page's import map; here, from the same vendored files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") {
      return nextResolve(new URL("./runtime/vendor/three/three.module.min.js", import.meta.url).href, context)
    }
    return nextResolve(specifier, context)
  },
})

const THREE = await import("three")
const { pixelArt, createSprite, setSpriteDepth } = await import("./runtime/engine/sprites.js")
const { createTileLayer, autotile16 } = await import("./runtime/engine/tilemap.js")

/** A texture with a known pixel size, standing in for a loaded PNG. */
function sheet(width: number, height: number) {
  const texture = new THREE.Texture()
  texture.image = { width, height }
  return texture
}

/** The engine's update hook, driven by hand. */
function fakeEngine() {
  const handlers = new Set<(dt: number) => void>()
  return {
    onUpdate(handler: (dt: number) => void) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    step(dt: number) {
      for (const handler of handlers) handler(dt)
    },
    handlers,
  }
}

/** The four UV corners of a quad, as [u, v] pairs rounded for comparison. */
function quadUvs(geometry: InstanceType<typeof THREE.BufferGeometry>, quad = 0) {
  const uv = geometry.getAttribute("uv") as InstanceType<typeof THREE.BufferAttribute>
  return [0, 1, 2, 3].map((corner) => {
    const index = quad * 4 + corner
    return [Number(uv.getX(index).toFixed(4)), Number(uv.getY(index).toFixed(4))]
  })
}

test("pixelArt keeps pixel art crisp: nearest filtering, no mipmaps, sRGB", () => {
  const texture = pixelArt(sheet(64, 64))
  assert.equal(texture.magFilter, THREE.NearestFilter)
  assert.equal(texture.minFilter, THREE.NearestFilter)
  assert.equal(texture.generateMipmaps, false)
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
})

test("a sprite is sized from its frame in pixels per unit and skips tone mapping", () => {
  const engine = fakeEngine()
  const sprite = createSprite(engine, {
    animations: { idle: { texture: sheet(1152, 192), frameWidth: 192, frameHeight: 192, frames: 6 } },
    pixelsPerUnit: 64,
  })
  assert.equal(sprite.mesh.scale.x, 3)
  assert.equal(sprite.mesh.scale.y, 3)
  assert.equal(sprite.mesh.material.toneMapped, false)
  assert.equal(sprite.mesh.material.depthTest, false)
  assert.equal(sprite.animation, "idle")
})

test("a sprite shows the current frame's slice of the sheet, and flipX mirrors it", () => {
  const engine = fakeEngine()
  const sprite = createSprite(engine, {
    animations: { run: { texture: sheet(768, 192), frameWidth: 192, frameHeight: 192, frames: 4 } },
  })
  assert.deepEqual(quadUvs(sprite.mesh.geometry), [[0, 1], [0.25, 1], [0, 0], [0.25, 0]])

  sprite.setFrame(2)
  assert.deepEqual(quadUvs(sprite.mesh.geometry), [[0.5, 1], [0.75, 1], [0.5, 0], [0.75, 0]])

  sprite.flipX = true
  assert.deepEqual(quadUvs(sprite.mesh.geometry), [[0.75, 1], [0.5, 1], [0.75, 0], [0.5, 0]])
})

test("frames advance at the animation's fps and loop; a one-shot stops on its last frame and reports it", () => {
  const engine = fakeEngine()
  const finished: string[] = []
  const sprite = createSprite(engine, {
    animations: {
      idle: { texture: sheet(512, 64), frameWidth: 64, frameHeight: 64, frames: 8, fps: 10 },
      attack: { texture: sheet(256, 64), frameWidth: 64, frameHeight: 64, frames: 4, fps: 10, loop: false },
    },
    onFinish: (name: string) => finished.push(name),
  })

  engine.step(0.25)
  assert.equal(sprite.frame, 2)
  engine.step(0.6)
  assert.equal(sprite.frame, 0, "8 frames at 10 fps wrap after 0.8 s")

  sprite.play("attack")
  engine.step(1)
  assert.equal(sprite.frame, 3)
  assert.equal(sprite.finished, true)
  assert.deepEqual(finished, ["attack"])
})

test("animations with different frame sizes resize the sprite and keep the anchor on the same point", () => {
  const engine = fakeEngine()
  const sprite = createSprite(engine, {
    animations: {
      idle: { texture: sheet(256, 80), frameWidth: 64, frameHeight: 80, frames: 4 },
      attack: { texture: sheet(768, 80), frameWidth: 96, frameHeight: 80, frames: 8 },
    },
    pixelsPerUnit: 16,
    anchor: [0.5, 0],
  })
  assert.equal(sprite.mesh.scale.x, 4)
  assert.equal(sprite.mesh.position.y, 2.5, "a bottom anchor lifts the quad by half its height")

  sprite.play("attack")
  assert.equal(sprite.mesh.scale.x, 6)
  assert.equal(sprite.mesh.position.x, 0)
  assert.equal(sprite.mesh.position.y, 2.5)
})

test("playing an unknown animation names the ones that exist", () => {
  const sprite = createSprite(fakeEngine(), {
    animations: { idle: { texture: sheet(64, 64), frameWidth: 64, frameHeight: 64 } },
  })
  assert.throws(() => sprite.play("jump"), (error: Error) => error.message.includes('"jump"') && error.message.includes("idle"))
})

test("a frame size that does not divide the sheet fails loudly instead of slicing garbage", () => {
  assert.throws(
    () =>
      createSprite(fakeEngine(), {
        animations: { tree: { texture: sheet(1536, 256), frameWidth: 256, frameHeight: 256, frames: 8 } },
      }),
    /tree/
  )
})

test("dispose stops the animation and frees the geometry", () => {
  const engine = fakeEngine()
  const sprite = createSprite(engine, {
    animations: { idle: { texture: sheet(128, 64), frameWidth: 64, frameHeight: 64, frames: 2 } },
  })
  sprite.dispose()
  assert.equal(engine.handlers.size, 0)
})

test("setSpriteDepth draws lower things in front within a layer, and higher layers above all of a lower one", () => {
  const back = new THREE.Object3D()
  const front = new THREE.Object3D()
  const roof = new THREE.Object3D()
  setSpriteDepth(back, { layer: 1, y: 5 })
  setSpriteDepth(front, { layer: 1, y: -5 })
  setSpriteDepth(roof, { layer: 2, y: 500 })
  assert.ok(front.renderOrder > back.renderOrder)
  assert.ok(roof.renderOrder > front.renderOrder)
})

test("a tile layer turns a grid of tile names into one mesh, row 0 at the top", () => {
  const layer = createTileLayer({
    texture: sheet(576, 384),
    tileSize: 64,
    tiles: { grass: 10, edge: 1 },
    grid: [
      ["edge", null],
      [null, "grass"],
    ],
  })
  assert.equal(layer.mesh.geometry.getAttribute("position").count, 8, "two quads, empty cells cost nothing")
  // Tile 1 is column 1, row 0 of a 9x6 atlas.
  const expected: [number, number][] = [[1 / 9, 1], [2 / 9, 1], [1 / 9, 5 / 6], [2 / 9, 5 / 6]]
  assert.deepEqual(quadUvs(layer.mesh.geometry, 0), expected.map(([u, v]) => [Number(u.toFixed(4)), Number(v.toFixed(4))]))
  assert.deepEqual(layer.cellToWorld(1, 1), { x: 1, y: -1 })
  assert.deepEqual(layer.worldToCell(1.2, -0.8), { column: 1, row: 1 })
  assert.equal(layer.mesh.material.toneMapped, false)
})

test("a tile layer rejects a tile name it was not given", () => {
  assert.throws(
    () => createTileLayer({ texture: sheet(576, 384), tileSize: 64, tiles: { grass: 10 }, grid: [["sand"]] }),
    (error: Error) => error.message.includes('"sand"') && error.message.includes("grass")
  )
})

test("autotile16 picks the piece of a 4x4 block from each land cell's four neighbours", () => {
  const land = [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
  ]
  const tiles = autotile16(land, { column: 0, row: 0, columns: 9 })
  assert.deepEqual(tiles.slice(1, 4).map((row: (number | null)[]) => row.slice(1, 4)), [
    [0, 1, 2],
    [9, 10, 11],
    [18, 19, 20],
  ])
  assert.equal(tiles[0]?.[0], null)

  const strips = [
    [1, 0, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 1, 0, 0],
  ]
  const elevated = autotile16(strips, { column: 5, row: 0, columns: 9 })
  assert.deepEqual([elevated[0]?.[0], elevated[1]?.[0], elevated[2]?.[0]], [8, 17, 26], "vertical strip")
  assert.deepEqual(elevated[0]?.slice(2), [32, 33, 34], "horizontal strip")
  assert.equal(elevated[2]?.[2], 35, "single")
})
