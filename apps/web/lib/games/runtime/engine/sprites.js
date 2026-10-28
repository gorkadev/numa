/**
 * 2D sprites on the same engine: pixel-art textures and sprite-sheet
 * animation drawn as flat quads facing an orthographic camera.
 *
 * Nothing here is a second renderer. A sprite is a plane mesh whose UVs point
 * at one frame of a sheet, so everything else in the toolkit — the loop,
 * input, sound, tweens, particles — keeps working on it unchanged.
 *
 * Draw order is explicit rather than left to the depth buffer: pixel art is
 * mostly transparent edges, and a 2D scene reads correctly only when it is
 * painted back to front (`setSpriteDepth`).
 */

import * as THREE from "three"

/**
 * Sets a texture up for pixel art: nearest filtering, no mipmaps, sRGB.
 *
 * Linear filtering, the three.js default, blurs every pixel into its
 * neighbours — the single most common reason a pixel-art game looks smeared.
 *
 * @param {THREE.Texture} texture
 * @returns {THREE.Texture} The same texture.
 */
export function pixelArt(texture) {
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

const textureCache = new Map()

/**
 * Loads a PNG as a pixel-art texture, once per URL however many sprites use it.
 *
 * Await every texture the first screen needs before starting the engine, so
 * the first frame is the finished picture rather than a scene filling in.
 *
 * @param {string} url
 * @returns {Promise<THREE.Texture>}
 */
export function loadPixelTexture(url) {
  if (!textureCache.has(url)) {
    const loading = new THREE.TextureLoader().loadAsync(url).then(pixelArt)
    // A failed load is not cached, so a retry can succeed.
    loading.catch(() => textureCache.delete(url))
    textureCache.set(url, loading)
  }
  return textureCache.get(url)
}

/** One draw-order layer is worth this much; y sorting inside a layer stays below it. */
const LAYER_STEP = 100000
/** Y is sorted to a hundredth of a unit, enough for sprites a pixel apart at 64 px per unit. */
const Y_PRECISION = 100

/**
 * Sets draw order for 2D: higher layers in front, and inside a layer a lower y in front.
 *
 * The lower-is-in-front rule is what makes a top-down scene read: a unit
 * standing below a tree is closer to the viewer and must cover its trunk.
 * Applied to the object and everything under it.
 *
 * @param {THREE.Object3D} object
 * @param {{ layer?: number, y?: number }} [options] `y` defaults to the
 *   object's own position, so pass the feet position when it differs.
 */
export function setSpriteDepth(object, { layer = 1, y = object.position.y } = {}) {
  const order = layer * LAYER_STEP + Math.round(-y * Y_PRECISION)
  object.traverse((child) => {
    child.renderOrder = order
  })
}

/**
 * Material shared by sprites and tile layers: unlit, blended, painted in
 * render order rather than depth-tested, and outside the engine's tone
 * mapping, which would otherwise shift every palette colour.
 */
export function spriteMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
}

function describeAnimation(name, animation) {
  const { texture, frameWidth, frameHeight, frames = 1, fps = 10, loop = true } = animation
  const image = texture?.image
  if (!image?.width || !image?.height) {
    throw new Error(`Sprite animation "${name}" has no loaded texture; await loadPixelTexture() first.`)
  }
  const columns = image.width / frameWidth
  if (!Number.isInteger(columns) || image.height % frameHeight !== 0 || frames > columns * (image.height / frameHeight)) {
    throw new Error(
      `Sprite animation "${name}": a ${image.width}x${image.height} sheet does not hold ${frames} frames of ${frameWidth}x${frameHeight}.`
    )
  }
  return { texture, frameWidth, frameHeight, frames, fps, loop, columns, rows: image.height / frameHeight }
}

/**
 * Creates an animated sprite from one or more sprite sheets, one per animation.
 *
 * Frame sizes are given, never guessed from the image: a sheet's height is
 * not always its frame width (Tiny Swords trees are 192x256 frames). The
 * sprite's `object` is what the game moves; `anchor` is the point of the
 * frame that sits on that position, as fractions with y measured up from
 * the bottom — `[0.5, 0]` puts the frame's bottom centre on it.
 *
 * Draw order follows the object's y every frame (`setSpriteDepth`) unless
 * `ySort` is false.
 *
 * @param {object} engine
 * @param {object} options
 * @param {Record<string, { texture: THREE.Texture, frameWidth: number,
 *   frameHeight: number, frames?: number, fps?: number, loop?: boolean }>} options.animations
 * @param {string} [options.animation] First animation; defaults to the first key.
 * @param {number} [options.pixelsPerUnit] Source pixels per world unit (64 for a 64 px tile grid).
 * @param {[number, number]} [options.anchor]
 * @param {number} [options.layer] Draw-order layer.
 * @param {boolean} [options.ySort]
 * @param {(name: string) => void} [options.onFinish] Called when a non-looping animation ends.
 */
export function createSprite(engine, options) {
  const {
    animations: definitions,
    animation: initial = Object.keys(definitions)[0],
    pixelsPerUnit = 64,
    anchor = [0.5, 0.5],
    layer = 1,
    ySort = true,
    onFinish,
  } = options

  const animations = Object.fromEntries(
    Object.entries(definitions).map(([name, animation]) => [name, describeAnimation(name, animation)])
  )

  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = spriteMaterial(null)
  const mesh = new THREE.Mesh(geometry, material)
  // A plain Object3D, not a Group: a Group would impose its own sort order on the mesh.
  const object = new THREE.Object3D()
  object.add(mesh)

  let current = null
  let name = null
  let frame = 0
  let time = 0
  let finished = false
  let flipX = false

  function writeUvs() {
    const column = frame % current.columns
    const row = Math.floor(frame / current.columns)
    let u0 = column / current.columns
    let u1 = (column + 1) / current.columns
    if (flipX) [u0, u1] = [u1, u0]
    const v1 = 1 - row / current.rows
    const v0 = 1 - (row + 1) / current.rows
    const uv = geometry.getAttribute("uv")
    uv.setXY(0, u0, v1)
    uv.setXY(1, u1, v1)
    uv.setXY(2, u0, v0)
    uv.setXY(3, u1, v0)
    uv.needsUpdate = true
  }

  const sprite = {
    object,
    mesh,
    get animation() {
      return name
    },
    get frame() {
      return frame
    },
    get finished() {
      return finished
    },
    get flipX() {
      return flipX
    },
    set flipX(value) {
      flipX = Boolean(value)
      writeUvs()
    },

    /**
     * Switches animation. Playing the one already running keeps its place
     * unless `restart` is set, so calling `play("run")` every frame is safe.
     */
    play(next, { restart = false } = {}) {
      if (!animations[next]) {
        throw new Error(`Unknown sprite animation "${next}". Available: ${Object.keys(animations).join(", ")}.`)
      }
      if (next === name && !restart) return sprite
      name = next
      current = animations[next]
      time = 0
      frame = 0
      finished = false
      if (material.map !== current.texture) {
        material.map = current.texture
        material.needsUpdate = true
      }
      const width = current.frameWidth / pixelsPerUnit
      const height = current.frameHeight / pixelsPerUnit
      mesh.scale.set(width, height, 1)
      mesh.position.set((0.5 - anchor[0]) * width, (0.5 - anchor[1]) * height, 0)
      writeUvs()
      return sprite
    },

    /** Shows one frame of the current animation, for sprites the game steps itself. */
    setFrame(index) {
      frame = Math.max(0, Math.min(current.frames - 1, Math.floor(index)))
      writeUvs()
      return sprite
    },

    dispose() {
      stopUpdates()
      object.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }

  const stopUpdates = engine.onUpdate((dt) => {
    if (ySort) setSpriteDepth(object, { layer })
    if (finished || current.frames < 2) return
    time += dt
    const step = Math.floor(time * current.fps)
    if (current.loop) {
      const next = step % current.frames
      if (next !== frame) sprite.setFrame(next)
    } else if (step >= current.frames) {
      sprite.setFrame(current.frames - 1)
      finished = true
      onFinish?.(name)
    } else if (step !== frame) {
      sprite.setFrame(step)
    }
  })

  sprite.play(initial)
  setSpriteDepth(object, { layer })
  return sprite
}
