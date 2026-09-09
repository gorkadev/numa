/**
 * Just enough physics to stand on a floor and walk into a wall.
 *
 * This is deliberately not a physics engine. No rotation, no friction model,
 * no constraints — axis-aligned boxes, gravity, and collisions resolved one
 * axis at a time. That covers platformers, shooters, top-down games and
 * puzzles, which is nearly all of them, and it does so with behaviour a game
 * can predict instead of behaviour it has to fight.
 *
 * The one non-obvious idea is resolving X, then Y, then Z separately. Solving
 * all three at once means picking which axis to push out of, and the wrong
 * pick is how a character walking into a step gets launched over it.
 */

import * as THREE from "three"

/**
 * Creates the world and hooks it to the engine's fixed timestep.
 *
 * Fixed, not per-frame: variable-step integration makes jump height depend on
 * frame rate, so the same jump clears a gap on one machine and misses on
 * another.
 */
export function createPhysics(engine, options = {}) {
  const { gravity = -24, maxFallSpeed = 60 } = options

  const bodies = []
  const statics = []
  const box = new THREE.Box3()
  const other = new THREE.Box3()

  /**
   * A moving thing.
   *
   * `halfExtents` rather than a size, because every test below wants the half
   * — deriving it once beats deriving it in each of them.
   */
  function addBody(object, config = {}) {
    const {
      size = [0.5, 1, 0.5],
      gravityScale = 1,
      /** Bounces off the floor at this fraction of impact speed. 0 lands flat. */
      restitution = 0,
      /** Per-second decay of horizontal speed when nothing is driving it. */
      drag = 0,
      onGround = null,
      onCollide = null,
    } = config

    const body = {
      object,
      velocity: new THREE.Vector3(),
      halfExtents: new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
      gravityScale,
      restitution,
      drag,
      grounded: false,
      onGround,
      onCollide,
      /** Set false to freeze a body without removing it — death, cutscenes. */
      enabled: true,
    }
    bodies.push(body)
    return body
  }

  /**
   * Registers a mesh as immovable geometry, measured from its own bounds.
   *
   * Taking the bounding box means a game can build level geometry with any
   * shape it likes and still get sane collision, as long as the shape is
   * roughly a box. Anything else should be approximated with several.
   */
  function addStatic(object) {
    const bounds = new THREE.Box3().setFromObject(object)
    const collider = { object, bounds }
    statics.push(collider)
    return collider
  }

  /** Re-measures a static that moved — a lift, a rotating platform. */
  function refreshStatic(collider) {
    collider.bounds.setFromObject(collider.object)
    return collider
  }

  const tempCenter = new THREE.Vector3()
  const tempSize = new THREE.Vector3()

  function bodyBox(body, target) {
    return target.setFromCenterAndSize(
      /**
       * Bodies are positioned by their feet, which is where every model in
       * `models.js` has its origin. The box is therefore centred half a height
       * above the object.
       */
      tempCenter.set(
        body.object.position.x,
        body.object.position.y + body.halfExtents.y,
        body.object.position.z
      ),
      tempSize.copy(body.halfExtents).multiplyScalar(2)
    )
  }

  /** Moves one axis and pushes the body back out of anything it entered. */
  function moveAxis(body, axis, distance) {
    if (distance === 0) return
    body.object.position[axis] += distance
    bodyBox(body, box)

    for (const collider of statics) {
      other.copy(collider.bounds)
      if (!box.intersectsBox(other)) continue

      /**
       * The push-out is the overlap on the axis just moved, in the direction
       * just moved from — which is exactly why the axes are done one at a
       * time. Any other axis's overlap is somebody else's problem this step.
       */
      const push =
        distance > 0
          ? other.min[axis] - box.max[axis]
          : other.max[axis] - box.min[axis]
      body.object.position[axis] += push

      if (axis === "y") {
        if (distance < 0) {
          const impact = body.velocity.y
          body.grounded = true
          body.velocity.y =
            body.restitution > 0 ? -impact * body.restitution : 0
          body.onGround?.(collider, impact)
        } else {
          /** Head hit: kill upward speed, or the player hangs under a ceiling. */
          body.velocity.y = 0
        }
      } else {
        body.velocity[axis] = 0
      }

      body.onCollide?.(collider, axis)
      bodyBox(body, box)
    }
  }

  engine.onFixedUpdate((dt) => {
    for (const body of bodies) {
      if (!body.enabled) continue

      body.velocity.y = Math.max(
        body.velocity.y + gravity * body.gravityScale * dt,
        -maxFallSpeed
      )

      if (body.drag > 0) {
        const keep = Math.pow(1 - body.drag, dt)
        body.velocity.x *= keep
        body.velocity.z *= keep
      }

      body.grounded = false
      moveAxis(body, "x", body.velocity.x * dt)
      moveAxis(body, "z", body.velocity.z * dt)
      moveAxis(body, "y", body.velocity.y * dt)
    }
  })

  return {
    bodies,
    statics,
    addBody,
    addStatic,
    refreshStatic,

    remove(body) {
      const index = bodies.indexOf(body)
      if (index >= 0) bodies.splice(index, 1)
    },

    /**
     * Jump, expressed as the height it should reach rather than as an impulse.
     *
     * Designers think in "clears a two-metre wall"; the initial speed that
     * produces it depends on gravity, and deriving it here means retuning
     * gravity does not silently retune every jump in the game.
     */
    jump(body, height = 1.6) {
      if (!body.grounded) return false
      body.velocity.y = Math.sqrt(2 * -gravity * body.gravityScale * height)
      body.grounded = false
      return true
    },

    /** Ground height under a point, or null over a hole. */
    groundAt(x, z, from = 50) {
      let best = null
      for (const collider of statics) {
        const bounds = collider.bounds
        if (
          x >= bounds.min.x &&
          x <= bounds.max.x &&
          z >= bounds.min.z &&
          z <= bounds.max.z &&
          bounds.max.y <= from
        ) {
          if (best === null || bounds.max.y > best) best = bounds.max.y
        }
      }
      return best
    },
  }
}

/**
 * Sphere overlap — the collision test games actually want for pickups, hits
 * and proximity.
 *
 * Compared squared, because the square root in `distanceTo` is pure cost when
 * the answer is a yes or no.
 */
export function overlaps(a, b, radius) {
  const pa = a.position ?? a
  const pb = b.position ?? b
  const dx = pa.x - pb.x
  const dy = pa.y - pb.y
  const dz = pa.z - pb.z
  return dx * dx + dy * dy + dz * dz <= radius * radius
}

/** Same test on the XZ plane, for top-down games where height is decoration. */
export function overlapsFlat(a, b, radius) {
  const pa = a.position ?? a
  const pb = b.position ?? b
  const dx = pa.x - pb.x
  const dz = pa.z - pb.z
  return dx * dx + dz * dz <= radius * radius
}

/**
 * A collectible list that removes what it hands back.
 *
 * Iterating a list while splicing out of it is the other classic first bug of
 * a game; this walks backwards so removal cannot skip an entry.
 */
export function collect(items, target, radius, onCollect) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (!overlaps(item, target, radius)) continue
    items.splice(i, 1)
    onCollect(item)
  }
}

/**
 * Keeps an object inside a box. Cheaper and more predictable than walling an
 * arena in with colliders, and it never lets a fast body tunnel out.
 */
export function clampToBounds(object, min, max) {
  object.position.x = Math.min(Math.max(object.position.x, min[0]), max[0])
  object.position.y = Math.min(Math.max(object.position.y, min[1]), max[1])
  object.position.z = Math.min(Math.max(object.position.z, min[2]), max[2])
  return object
}
