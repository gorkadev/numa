/**
 * Motion: the difference between things moving and things feeling alive.
 *
 * Two kinds live here and they are not interchangeable. A **tween** runs a
 * known change over a known time — a door opening, a menu sliding in — and it
 * ends. A **spring** chases a target that keeps changing and never resolves to
 * a fixed schedule; it is what a camera, a cursor or a follower wants, because
 * a tween restarted every frame is a tween that never plays.
 *
 * Three.js's own `AnimationMixer` is for baked keyframe clips. It is wrapped at
 * the bottom of this file rather than replaced.
 */

import * as THREE from "three"

import { clamp, damp } from "./math.js"

/**
 * Easing curves, as functions from 0..1 to 0..1.
 *
 * `outCubic` is the safe default for anything the player triggers: fast at the
 * start, so the interface answers immediately, and slow at the end, so it
 * settles instead of stopping. `outBack` and `outElastic` overshoot, which
 * reads as weight — use them on arrivals, never on exits.
 */
export const easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
  outElastic: (t) =>
    t === 0 || t === 1
      ? t
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) +
        1,
  outBounce: (t) => {
    const n = 7.5625
    const d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

/**
 * Runs a value from 0 to 1 over a duration and hands each step to `onUpdate`.
 *
 * Registered on the engine, so it pauses when the game pauses — a tween on its
 * own timer keeps running behind a pause menu and finishes in the dark.
 */
export function tween(engine, options) {
  const {
    duration = 0.3,
    delay = 0,
    ease = easing.outCubic,
    from = 0,
    to = 1,
    onUpdate,
    onComplete,
    loop = false,
    yoyo = false,
  } = options

  let time = -delay
  let direction = 1
  let done = false

  const stop = engine.onUpdate((dt) => {
    if (done) return
    time += dt * direction
    if (time < 0) return

    const t = clamp(time / duration, 0, 1)
    onUpdate?.(from + (to - from) * ease(t), t)

    if (t >= 1) {
      if (yoyo) {
        direction = -1
        time = duration
      } else if (loop) {
        time = 0
      } else {
        done = true
        stop()
        onComplete?.()
      }
    } else if (t <= 0 && direction === -1) {
      if (loop) {
        direction = 1
      } else {
        done = true
        stop()
        onComplete?.()
      }
    }
  })

  return {
    cancel() {
      done = true
      stop()
    },
  }
}

/**
 * A critically-damped spring on a single number.
 *
 * "Critically damped" means it reaches the target as fast as it can without
 * overshooting — which is what almost every UI and camera actually wants.
 * `stiffness` is the only knob; lower `damping` below 1 for a bouncier one.
 */
export function spring(value = 0, options = {}) {
  const { stiffness = 120, damping = 1 } = options
  const state = { value, velocity: 0, target: value }
  const dampingCoefficient = 2 * Math.sqrt(stiffness) * damping

  return {
    state,
    get value() {
      return state.value
    },
    set target(next) {
      state.target = next
    },
    get target() {
      return state.target
    },
    /** Skips the animation — for respawns and scene changes. */
    snap(next = state.target) {
      state.value = next
      state.target = next
      state.velocity = 0
    },
    update(dt) {
      const force = -stiffness * (state.value - state.target)
      const drag = -dampingCoefficient * state.velocity
      state.velocity += (force + drag) * dt
      state.value += state.velocity * dt
      return state.value
    },
  }
}

/**
 * Camera shake, as a decaying offset applied after everything else has
 * positioned the camera.
 *
 * Applied and *removed* each frame rather than accumulated: a shake that adds
 * to the camera's own position drifts, and after ten hits the camera is
 * somewhere else entirely.
 */
export function createShake(engine, options = {}) {
  const { decay = 2.4, maxOffset = 0.5, maxRoll = 0.06 } = options
  let trauma = 0
  const offset = new THREE.Vector3()
  let roll = 0

  /**
   * Last frame's shake is undone *before* anything moves the camera, and this
   * frame's is applied after. Adding an offset without removing it lets the
   * camera drift: ten hits later it is looking somewhere else entirely.
   */
  engine.onUpdate(() => {
    engine.camera.position.sub(offset)
    engine.camera.rotation.z -= roll
    offset.set(0, 0, 0)
    roll = 0
  })

  engine.onLateUpdate((dt) => {
    if (trauma <= 0) return
    trauma = Math.max(0, trauma - decay * dt)

    /**
     * Squared, so small hits are barely felt and big ones dominate — linear
     * trauma makes every impact feel identical.
     */
    const amount = trauma * trauma
    offset.set(
      (Math.random() * 2 - 1) * maxOffset * amount,
      (Math.random() * 2 - 1) * maxOffset * amount,
      0
    )
    roll = (Math.random() * 2 - 1) * maxRoll * amount
    engine.camera.position.add(offset)
    engine.camera.rotation.z += roll
  })

  return {
    /** 0..1. A footstep is 0.15, a death is 1. */
    add(amount = 0.4) {
      trauma = clamp(trauma + amount, 0, 1)
    },
    get trauma() {
      return trauma
    },
  }
}

/** Constant rotation. The most-used animation in games, and one line of it. */
export function spin(engine, object, speed = 1, axis = "y") {
  return engine.onUpdate((dt) => {
    object.rotation[axis] += speed * dt
  })
}

/** A slow hover. Pickups that bob are read as pickups; ones that sit are scenery. */
export function float(engine, object, options = {}) {
  const { amplitude = 0.2, speed = 2, phase = Math.random() * Math.PI * 2 } =
    options
  const baseY = object.position.y
  return engine.onUpdate((_, { elapsed }) => {
    object.position.y = baseY + Math.sin(elapsed * speed + phase) * amplitude
  })
}

/**
 * The scale-up an object does when it appears.
 *
 * `outBack` overshoots slightly before settling, which is the whole effect —
 * a linear scale-up looks like a rendering bug.
 */
export function popIn(engine, object, options = {}) {
  const { duration = 0.35, scale = object.scale.x } = options
  object.scale.setScalar(0.001)
  return tween(engine, {
    duration,
    ease: easing.outBack,
    onUpdate: (value) => object.scale.setScalar(value * scale),
  })
}

/** The shrink-away on the way out, with the object removed at the end. */
export function popOut(engine, object, options = {}) {
  const { duration = 0.2, onComplete } = options
  const scale = object.scale.x
  return tween(engine, {
    duration,
    ease: easing.inCubic,
    from: 1,
    to: 0,
    onUpdate: (value) => object.scale.setScalar(value * scale),
    onComplete: () => {
      object.removeFromParent()
      onComplete?.()
    },
  })
}

/**
 * A hit flash: the material's emissive punched up and eased back down.
 *
 * Reads instantly, costs nothing, and works on any standard material — which
 * is why it is the near-universal choice for damage feedback.
 */
export function flash(engine, object, options = {}) {
  const { color = 0xffffff, duration = 0.18, intensity = 1.5 } = options
  const targets = []
  object.traverse((child) => {
    if (child.isMesh && child.material?.emissive) targets.push(child.material)
  })
  const originals = targets.map((material) => ({
    color: material.emissive.getHex(),
    intensity: material.emissiveIntensity,
  }))

  return tween(engine, {
    duration,
    from: 1,
    to: 0,
    ease: easing.outQuad,
    onUpdate: (value) => {
      for (const material of targets) {
        material.emissive.setHex(color)
        material.emissiveIntensity = value * intensity
      }
    },
    onComplete: () => {
      targets.forEach((material, i) => {
        material.emissive.setHex(originals[i].color)
        material.emissiveIntensity = originals[i].intensity
      })
    },
  })
}

/**
 * A walk cycle for a rig from `createCharacter()`.
 *
 * Opposite arm to leg, driven by one phase, with the swing scaled by how fast
 * the character is actually moving — so it slows to a stop instead of stopping
 * mid-stride. `bob` on the torso is what sells the weight.
 */
export function walkCycle(rig, elapsed, speed = 1, options = {}) {
  const { swing = 0.9, cadence = 7, bob = 0.04 } = options
  const parts = rig.parts
  if (!parts) return

  const amount = Math.min(speed, 1) * swing
  const phase = elapsed * cadence * Math.min(speed + 0.2, 1.6)
  const stride = Math.sin(phase) * amount

  parts.legL.rotation.x = stride
  parts.legR.rotation.x = -stride
  parts.armL.rotation.x = -stride * 0.8
  parts.armR.rotation.x = stride * 0.8
  parts.torso.position.y =
    parts.torso.userData.baseY ??
    (parts.torso.userData.baseY = parts.torso.position.y)
  parts.torso.position.y += Math.abs(Math.sin(phase)) * bob * amount
  parts.head.rotation.z = Math.sin(phase) * 0.04 * amount
}

/**
 * Wraps three's keyframe animation system for models that carry clips.
 *
 * Nothing in the sandbox loads a GLTF, so this mostly matters for clips built
 * in code — but the crossfade below is the part worth having either way:
 * switching animations by `stop()` then `play()` pops, and every game that
 * does it looks broken at the seam.
 */
export function createMixer(engine, root, clips = []) {
  const mixer = new THREE.AnimationMixer(root)
  const actions = new Map()
  for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip))

  let current = null
  engine.onUpdate((dt) => mixer.update(dt))
  engine.onDispose(() => mixer.stopAllAction())

  return {
    mixer,
    actions,
    play(name, fade = 0.2) {
      const next = actions.get(name)
      if (!next || next === current) return next
      next.reset().play()
      if (current) current.crossFadeTo(next, fade, true)
      current = next
      return next
    },
  }
}

