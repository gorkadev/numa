/**
 * Things to look at, built out of code.
 *
 * The sandbox has no asset pipeline and no network, so every model a game
 * shows has to be assembled from primitives. That is less of a limit than it
 * sounds — a box with rounded corners, a decent material and a shadow reads as
 * a crate — but it is a lot of repeated fiddling, and the fiddling is where
 * procedural models usually end up looking like a pile of grey boxes.
 *
 * Everything here returns a `THREE.Group` with `castShadow`/`receiveShadow`
 * already set, and rigged models expose their pieces on `.parts` so animation
 * can reach them by name.
 */

import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"

import { random, TAU } from "./math.js"

/**
 * A palette that holds together.
 *
 * Colours picked one at a time clash; these share a saturation and lightness
 * band on purpose, so a game that grabs three of them at random still looks
 * designed.
 */
export const PALETTE = {
  ink: 0x11131a,
  slate: 0x3b445c,
  steel: 0x8a93ad,
  cloud: 0xe8ecf7,
  paper: 0xfbf7ef,
  red: 0xff5a5f,
  orange: 0xff9f43,
  yellow: 0xffd93d,
  lime: 0x9bde5a,
  green: 0x2ecc71,
  teal: 0x24d3c4,
  sky: 0x4aa8ff,
  blue: 0x2563eb,
  indigo: 0x6366f1,
  violet: 0xa855f7,
  pink: 0xff6bcb,
  sand: 0xd8c39a,
  bark: 0x7a5230,
  moss: 0x4f7942,
}

/** The colours that read as distinct next to each other, for teams and items. */
export const PALETTE_SEQUENCE = [
  PALETTE.blue,
  PALETTE.orange,
  PALETTE.green,
  PALETTE.pink,
  PALETTE.yellow,
  PALETTE.violet,
  PALETTE.teal,
  PALETTE.red,
]

/** Solid, unshiny, cheap. The right default for most game geometry. */
export function matte(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    ...options,
  })
}

/** Plastic with a highlight — collectibles, UI props, anything that should pop. */
export function glossy(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.1,
    ...options,
  })
}

/** Needs `addEnvironment()` from `lighting.js`, or it renders black. */
export function metal(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 1,
    ...options,
  })
}

/**
 * Self-lit, and bright enough that the bloom pass in `fx.js` picks it up.
 *
 * `emissive` on top of the base colour rather than `MeshBasicMaterial`, so the
 * object still takes a shadow and still belongs to the scene's lighting.
 */
export function glow(color, intensity = 1.6, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    ...options,
  })
}

/**
 * Flat cel shading, from a two-step gradient generated in code.
 *
 * `MeshToonMaterial` reads its ramp from a texture, and the default ramp is a
 * smooth one — which is to say, not toon at all. The nearest-filtered strip
 * below is what produces the hard terminator line.
 */
export function toon(color, steps = 3, options = {}) {
  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) data[i] = (i / (steps - 1)) * 255
  const gradient = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...options })
}

/** Marks a whole subtree as casting and receiving shadows. */
export function castShadows(object, cast = true, receive = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast
      child.receiveShadow = receive
    }
  })
  return object
}

/**
 * A humanoid, rigged.
 *
 * Deliberately blocky: a capsule torso with box limbs is legible at any size,
 * animates convincingly from four rotations, and never falls into the uncanny
 * valley the way a half-finished realistic character does. The pieces hang off
 * `.parts` so `walkCycle()` in `anim.js` can drive them.
 *
 * Limbs are pivoted at the shoulder and hip — their geometry is translated
 * down inside a pivot group — because a leg rotated about its centre scissors
 * instead of stepping.
 */
export function createCharacter(options = {}) {
  const {
    color = PALETTE.blue,
    skin = PALETTE.sand,
    accent = PALETTE.cloud,
    height = 1.8,
  } = options

  const unit = height / 1.8
  const group = new THREE.Group()
  const bodyMaterial = matte(color)
  const skinMaterial = matte(skin)

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.26 * unit, 0.5 * unit, 6, 12),
    bodyMaterial
  )
  torso.position.y = 1.05 * unit

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24 * unit, 20, 16),
    skinMaterial
  )
  head.position.y = 1.55 * unit

  /**
   * Eyes on the -Z face: the character faces -Z at rest, which is the
   * direction `atan2(x, z)` headings in `controls.js` treat as zero.
   */
  const eyeGeometry = new THREE.SphereGeometry(0.04 * unit, 10, 8)
  const eyeMaterial = matte(PALETTE.ink)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
    eye.position.set(0.09 * unit * side, 1.58 * unit, -0.2 * unit)
    group.add(eye)
  }

  const limb = (width, length, material) => {
    const pivot = new THREE.Group()
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(width, length, width, 2, width * 0.4),
      material
    )
    mesh.position.y = -length / 2
    pivot.add(mesh)
    return pivot
  }

  const armL = limb(0.14 * unit, 0.6 * unit, skinMaterial)
  armL.position.set(-0.34 * unit, 1.3 * unit, 0)
  const armR = limb(0.14 * unit, 0.6 * unit, skinMaterial)
  armR.position.set(0.34 * unit, 1.3 * unit, 0)

  const legL = limb(0.17 * unit, 0.72 * unit, matte(accent))
  legL.position.set(-0.14 * unit, 0.74 * unit, 0)
  const legR = limb(0.17 * unit, 0.72 * unit, matte(accent))
  legR.position.set(0.14 * unit, 0.74 * unit, 0)

  group.add(torso, head, armL, armR, legL, legR)
  group.parts = { torso, head, armL, armR, legL, legR }
  /** Half-height and radius, so `physics.js` can build a body without measuring. */
  group.userData.size = { radius: 0.35 * unit, height }

  return castShadows(group)
}

/** A crate. Rounded corners and a slightly darker frame, so it is not a cube. */
export function createCrate(size = 1, color = PALETTE.bark) {
  const group = new THREE.Group()
  const box = new THREE.Mesh(
    new RoundedBoxGeometry(size, size, size, 3, size * 0.06),
    matte(color)
  )
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.02, size * 0.16, size * 1.02),
    matte(PALETTE.sand)
  )
  group.add(box, frame)
  return castShadows(group)
}

/** A spinning collectible. Give it to `spin()` in `anim.js` and it is done. */
export function createCoin(radius = 0.35, color = PALETTE.yellow) {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, radius * 0.18, 24),
    /*
     * A low emissive on purpose: past about 0.5 the bloom pass in `fx.js`
     * saturates the highlight to white and the coin stops looking gold.
     */
    glow(color, 0.4)
  )
  /** Laid on its edge, facing the camera, which is how a coin reads as a coin. */
  coin.rotation.x = Math.PI / 2
  const group = new THREE.Group()
  group.add(coin)
  return castShadows(group, true, false)
}

/** A low-poly tree. `seed` makes a forest of them look grown rather than cloned. */
export function createTree(options = {}) {
  const {
    height = 3,
    trunk = PALETTE.bark,
    leaves = PALETTE.moss,
    seed = random.next(),
  } = options

  const group = new THREE.Group()
  const jitter = 0.85 + seed * 0.4

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.06, height * 0.09, height * 0.5, 7),
    matte(trunk)
  )
  stem.position.y = height * 0.25
  group.add(stem)

  /** Three shrinking cones: enough silhouette to read as a conifer at distance. */
  for (let i = 0; i < 3; i++) {
    const tier = new THREE.Mesh(
      new THREE.ConeGeometry(
        height * (0.34 - i * 0.07) * jitter,
        height * 0.4,
        8
      ),
      matte(leaves)
    )
    tier.position.y = height * (0.5 + i * 0.22)
    tier.rotation.y = i * 0.7
    group.add(tier)
  }

  return castShadows(group)
}

/** A rock. Randomised vertices, flat-shaded, so no two are the same. */
export function createRock(size = 1, color = PALETTE.steel, seed = random.next()) {
  const geometry = new THREE.IcosahedronGeometry(size, 1)
  const position = geometry.attributes.position
  const offset = seed * 100
  for (let i = 0; i < position.count; i++) {
    const scale =
      0.82 + 0.36 * Math.abs(Math.sin(i * 1.7 + offset) * Math.cos(i * 0.9))
    position.setXYZ(
      i,
      position.getX(i) * scale,
      position.getY(i) * scale * 0.8,
      position.getZ(i) * scale
    )
  }
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, matte(color, { flatShading: true }))
  const group = new THREE.Group()
  group.add(mesh)
  return castShadows(group)
}

/**
 * A ground plane with a grid drawn into its texture.
 *
 * The grid is not decoration: a flat untextured floor gives the eye nothing to
 * measure speed against, and a game on one feels like it is standing still.
 */
export function createGround(options = {}) {
  const {
    size = 200,
    color = PALETTE.slate,
    lineColor = "rgba(255,255,255,0.16)",
    cell = 2,
  } = options

  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 128
  const context = canvas.getContext("2d")
  context.fillStyle = `#${new THREE.Color(color).getHexString()}`
  context.fillRect(0, 0, 128, 128)
  context.strokeStyle = lineColor
  context.lineWidth = 4
  context.strokeRect(0, 0, 128, 128)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(size / cell, size / cell)
  /** Anisotropy is what keeps the grid from turning to mush toward the horizon. */
  texture.anisotropy = 8

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  return ground
}

/** A solid block to stand on. Returns a mesh sized as given, centred on `y`. */
export function createPlatform(width = 4, depth = 4, height = 0.5, color = PALETTE.steel) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 2, 0.08),
    matte(color)
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Text in the world, rasterised into a sprite.
 *
 * There is no font file to load and no `TextGeometry` without one, so labels,
 * damage numbers and signposts are drawn on a canvas. A sprite always faces
 * the camera, which is what a label should do anyway.
 */
export function createLabel(text, options = {}) {
  const {
    color = "#ffffff",
    background = "rgba(10, 12, 20, 0.72)",
    fontSize = 64,
    padding = 24,
    scale = 1,
  } = options

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  const font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
  context.font = font
  const width = Math.ceil(context.measureText(text).width) + padding * 2
  const height = fontSize + padding * 2

  /**
   * Power-of-two-ish sizing is not required, but re-measuring after the resize
   * is: setting `canvas.width` resets the 2D context, font included.
   */
  canvas.width = width
  canvas.height = height
  context.font = font
  context.textAlign = "center"
  context.textBaseline = "middle"

  if (background !== "none") {
    context.fillStyle = background
    context.beginPath()
    context.roundRect(0, 0, width, height, 16)
    context.fill()
  }
  context.fillStyle = color
  context.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  sprite.scale.set((width / height) * scale, scale, 1)
  sprite.userData.dispose = () => texture.dispose()
  return sprite
}

/**
 * Many copies of one mesh in a single draw call.
 *
 * The moment a game wants a forest, a crowd or an asteroid field, adding
 * meshes one at a time stops being viable somewhere around a few hundred.
 * `InstancedMesh` draws ten thousand for the price of one.
 */
export function createField(geometry, material, count, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const euler = new THREE.Euler()

  for (let i = 0; i < count; i++) {
    position.set(0, 0, 0)
    euler.set(0, random.next() * TAU, 0)
    scale.set(1, 1, 1)
    place(i, position, euler, scale)
    quaternion.setFromEuler(euler)
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
