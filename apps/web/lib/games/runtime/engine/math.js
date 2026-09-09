/**
 * Numbers: the helpers every game reaches for in its first ten minutes.
 *
 * Three.js ships `MathUtils`, and everything here that duplicates it does so
 * for a reason — `damp` is the frame-rate-independent version of `lerp` that
 * `MathUtils.lerp` is not, and `rng` is seedable where `Math.random` is not.
 * Anything three already does well is re-exported rather than reimplemented.
 */

import * as THREE from "three"
import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js"

export const {
  clamp,
  lerp,
  mapLinear,
  degToRad,
  radToDeg,
  smoothstep,
  smootherstep,
  pingpong,
  euclideanModulo,
} = THREE.MathUtils

export const TAU = Math.PI * 2

/**
 * Frame-rate independent easing toward a target.
 *
 * `lerp(current, target, 0.1)` in an update loop is the most common bug in
 * hobby game code: it moves 10% *per frame*, so the same game feels twice as
 * fast on a 120Hz screen. `damp` takes a half-life in seconds — the time for
 * the remaining distance to halve — which is a property of the game, not of
 * the display.
 */
export function damp(current, target, halfLife, dt) {
  if (halfLife <= 0) return target
  return target + (current - target) * Math.pow(2, -dt / halfLife)
}

/** `damp`, applied component-wise to a Vector3 in place. */
export function dampVec3(current, target, halfLife, dt) {
  current.x = damp(current.x, target.x, halfLife, dt)
  current.y = damp(current.y, target.y, halfLife, dt)
  current.z = damp(current.z, target.z, halfLife, dt)
  return current
}

/**
 * `damp` for angles, taking the short way round.
 *
 * Damping 0.1rad toward 6.2rad the naive way sweeps almost a full turn
 * backwards; wrapping the difference into (-PI, PI] first makes a turning
 * character turn the way a player expects.
 */
export function dampAngle(current, target, halfLife, dt) {
  const delta = wrapAngle(target - current)
  return current + delta - delta * Math.pow(2, -dt / halfLife)
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(angle) {
  return euclideanModulo(angle + Math.PI, TAU) - Math.PI
}

/**
 * A seedable pseudo-random generator (mulberry32).
 *
 * Worth having whenever the game generates a level: with a fixed seed the
 * same world comes back every run, which is the difference between a bug you
 * can reproduce and one you can only describe. Pass no seed for the usual
 * "different every time" behaviour.
 */
export function rng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    seed,
    /** Float in [0, 1). */
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max] — both ends included, unlike `range`. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with the given probability. */
    chance: (probability = 0.5) => next() < probability,
    /** One element of an array. */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** A copy of the array in random order. */
    shuffle: (items) => {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    /** A point on the unit sphere — useful for scattering and burst effects. */
    onSphere: (target = new THREE.Vector3()) => {
      const z = next() * 2 - 1
      const angle = next() * TAU
      const r = Math.sqrt(1 - z * z)
      return target.set(r * Math.cos(angle), r * Math.sin(angle), z)
    },
  }
}

/** A shared generator, for the common case where nobody cares about seeds. */
export const random = rng()

/**
 * Smooth 2D value noise in [-1, 1], from three's Perlin implementation.
 *
 * The seed shifts the sample plane rather than the algorithm, which is enough
 * to make two noise fields in one game look unrelated.
 */
export function noise2D(seed = 0) {
  const perlin = new ImprovedNoise()
  const offset = seed * 137.13
  return (x, y) => perlin.noise(x + offset, y + offset, offset)
}

/**
 * Layered noise: the same field sampled at doubling frequencies and halving
 * amplitudes. This is what turns flat noise into terrain that has both hills
 * and pebbles.
 */
export function fbm2D(seed = 0, octaves = 4) {
  const sample = noise2D(seed)
  return (x, y) => {
    let value = 0
    let amplitude = 1
    let frequency = 1
    let total = 0
    for (let i = 0; i < octaves; i++) {
      value += sample(x * frequency, y * frequency) * amplitude
      total += amplitude
      amplitude *= 0.5
      frequency *= 2
    }
    return value / total
  }
}

/**
 * Runs `fn` at most once every `seconds`, and reports how many whole
 * intervals elapsed — a spawner asked to fire every 0.2s should fire twice
 * after a 0.45s hitch, not once.
 */
export function createTimer(seconds) {
  let accumulated = 0
  return {
    /** Advances the timer, returning the number of times it fired. */
    tick(dt) {
      accumulated += dt
      let fired = 0
      while (accumulated >= seconds) {
        accumulated -= seconds
        fired++
      }
      return fired
    },
    reset() {
      accumulated = 0
    },
  }
}
