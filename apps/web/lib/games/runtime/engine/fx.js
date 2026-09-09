/**
 * The pass that makes a scene look finished.
 *
 * Bloom is doing most of the work here, and it is worth being precise about
 * why: it is not "glow", it is the reason a bright object reads as *emitting*
 * light rather than being painted a light colour. Without it, `glow()`
 * materials from `models.js` are just pale — with it, they are neon.
 *
 * Everything is optional and everything costs frame time. A game that runs
 * badly with effects and well without them should ship without them.
 */

import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"

import { random } from "./math.js"

/**
 * Routes rendering through a composer and hands the engine back a new render
 * callback, so the game loop is untouched.
 *
 * @param {object} engine
 * @param {object} [options]
 * @param {number} [options.strength] How much the glow spreads out of a source.
 * @param {number} [options.threshold] Brightness above which things bloom.
 *   Measured *before* tone mapping, so the scale is not 0..1 — a lit white
 *   surface outdoors sits near 1. Drop this below about 0.9 and the whole
 *   picture hazes over, which reads as a dirty lens rather than as light.
 *   Raise it to bloom only the `glow()` materials that were meant to.
 */
export function addBloom(engine, options = {}) {
  const { strength = 0.55, radius = 0.45, threshold = 1.1 } = options

  const composer = new EffectComposer(engine.renderer)
  composer.addPass(new RenderPass(engine.scene, engine.camera))

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(engine.size.width, engine.size.height),
    strength,
    radius,
    threshold
  )
  composer.addPass(bloom)

  /**
   * `OutputPass` applies tone mapping and the sRGB conversion that the
   * renderer would normally do on its own. Skipping it is the classic
   * post-processing mistake: the picture comes out washed out and nobody can
   * say why.
   */
  composer.addPass(new OutputPass())

  engine.onResize(({ width, height }) => composer.setSize(width, height))
  engine.setRenderCallback(() => composer.render())
  engine.onDispose(() => composer.dispose())

  return {
    composer,
    bloom,
    /** Reverts to plain rendering — for a low-quality toggle, or for debugging. */
    disable() {
      engine.setRenderCallback(() =>
        engine.renderer.render(engine.scene, engine.camera)
      )
    },
  }
}

/**
 * A pool of particles drawn as one `Points` object.
 *
 * Pooled rather than allocated: a burst that creates geometry per explosion
 * stutters the moment two explosions overlap. The pool is filled once, and
 * `burst()` only rewrites positions of particles that are already there.
 *
 * Dead particles are parked far off-screen rather than removed, because a
 * `Points` object draws a fixed count and rebuilding the buffer would cost
 * more than drawing the corpses.
 */
export function createParticles(engine, options = {}) {
  const {
    count = 400,
    size = 0.14,
    color = 0xffffff,
    gravity = -8,
    drag = 1.6,
    lifetime = 0.9,
  } = options

  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const ages = new Float32Array(count).fill(Infinity)
  const colors = new Float32Array(count * 3)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    /** Additive, so overlapping particles brighten instead of stacking flatly. */
    blending: THREE.AdditiveBlending,
    /** Perspective sizing: near particles bigger, which is what sells depth. */
    sizeAttenuation: true,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  engine.scene.add(points)

  const tint = new THREE.Color(color)
  let cursor = 0

  for (let i = 0; i < count; i++) positions[i * 3 + 1] = -9999

  engine.onUpdate((dt) => {
    /**
     * Exponential decay, so `drag` is a rate per second and the particles slow
     * at the same pace on a 60Hz and a 144Hz screen.
     */
    const keep = Math.exp(-drag * dt)
    let alive = false

    for (let i = 0; i < count; i++) {
      if (ages[i] >= lifetime) continue
      alive = true
      ages[i] += dt

      velocities[i * 3 + 1] += gravity * dt
      velocities[i * 3] *= keep
      velocities[i * 3 + 1] *= keep
      velocities[i * 3 + 2] *= keep

      positions[i * 3] += velocities[i * 3] * dt
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt

      /** Faded by dimming the vertex colour: one buffer, no per-particle alpha. */
      const fade = Math.max(0, 1 - ages[i] / lifetime)
      colors[i * 3] = tint.r * fade
      colors[i * 3 + 1] = tint.g * fade
      colors[i * 3 + 2] = tint.b * fade

      if (ages[i] >= lifetime) positions[i * 3 + 1] = -9999
    }

    if (alive) {
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.color.needsUpdate = true
    }
  })

  return {
    points,
    material,

    /**
     * Throws `amount` particles out of a point.
     *
     * The cursor wraps, so a long game reuses the oldest particles rather than
     * running out — a burst that silently does nothing after the thousandth
     * explosion is worse than one that steals a few sparks from the last.
     */
    burst(position, amount = 24, options = {}) {
      const { speed = 6, spread = 1, color: burstColor = null } = options
      if (burstColor !== null) tint.set(burstColor)

      for (let n = 0; n < amount; n++) {
        const i = cursor
        cursor = (cursor + 1) % count

        positions[i * 3] = position.x
        positions[i * 3 + 1] = position.y
        positions[i * 3 + 2] = position.z

        const direction = random.onSphere()
        const power = speed * (0.4 + random.next() * 0.6)
        velocities[i * 3] = direction.x * power * spread
        velocities[i * 3 + 1] = Math.abs(direction.y) * power
        velocities[i * 3 + 2] = direction.z * power * spread

        ages[i] = 0
      }

      geometry.attributes.position.needsUpdate = true
    },

    dispose() {
      geometry.dispose()
      material.dispose()
      points.removeFromParent()
    },
  }
}

/**
 * A ring that expands and fades — the shockwave of a hit, a landing, a pickup.
 *
 * Free of the particle system on purpose: it is one mesh and one tween, and it
 * communicates "something happened *here*" better than a spray of dots.
 */
export function shockwave(engine, position, options = {}) {
  const {
    color = 0xffffff,
    duration = 0.45,
    maxRadius = 3,
    orientation = "ground",
  } = options

  const geometry = new THREE.RingGeometry(0.9, 1, 48)
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(geometry, material)
  ring.position.copy(position)
  if (orientation === "ground") ring.rotation.x = -Math.PI / 2
  engine.scene.add(ring)

  let time = 0
  const stop = engine.onUpdate((dt) => {
    time += dt
    const t = Math.min(time / duration, 1)
    ring.scale.setScalar(0.1 + t * maxRadius)
    material.opacity = 1 - t
    if (t >= 1) {
      stop()
      geometry.dispose()
      material.dispose()
      ring.removeFromParent()
    }
  })

  return ring
}

/**
 * A fading trail behind a moving object, drawn as a line through its recent
 * positions.
 *
 * Cheap motion clarity: a fast projectile without one is a teleporting dot,
 * because a frame at 60Hz is long enough for it to cross its own length.
 */
export function createTrail(engine, object, options = {}) {
  const { length = 20, color = 0xffffff, width = 1 } = options

  const positions = new Float32Array(length * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))

  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, linewidth: width })
  )
  line.frustumCulled = false
  engine.scene.add(line)

  for (let i = 0; i < length; i++) {
    positions[i * 3] = object.position.x
    positions[i * 3 + 1] = object.position.y
    positions[i * 3 + 2] = object.position.z
  }

  const stop = engine.onLateUpdate(() => {
    /** Shifted back one slot per frame: index 0 is always the newest point. */
    positions.copyWithin(3, 0, (length - 1) * 3)
    positions[0] = object.position.x
    positions[1] = object.position.y
    positions[2] = object.position.z
    geometry.attributes.position.needsUpdate = true
  })

  return {
    line,
    dispose() {
      stop()
      geometry.dispose()
      line.material.dispose()
      line.removeFromParent()
    },
  }
}
