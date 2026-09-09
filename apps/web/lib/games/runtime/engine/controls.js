/**
 * Camera rigs and the movement that drives them.
 *
 * A camera is a game design decision, not a transform: "third person",
 * "top down" and "side on" each imply a different relationship between what
 * the player presses and where the character goes. Each rig below owns that
 * relationship, so a game picks a genre and gets the whole feel of it.
 *
 * Every rig returns `{ update, dispose }` and registers itself with the
 * engine's *late* phase, so it follows a position that is already final for
 * the frame — a camera updated before movement is a camera that lags by one
 * frame and reads as motion sickness.
 */

import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js"

import { damp, dampAngle, dampVec3, clamp, TAU } from "./math.js"

/**
 * Mouse-driven orbiting around a point. The right default for anything the
 * player inspects rather than inhabits: a puzzle board, a model viewer, a
 * turn-based map.
 */
export function createOrbitCamera(engine, options = {}) {
  const {
    target = [0, 0, 0],
    minDistance = 2,
    maxDistance = 60,
    /** Stops just short of the horizon so the camera never rolls under the floor. */
    maxPolarAngle = Math.PI / 2 - 0.05,
    enablePan = true,
    autoRotate = false,
  } = options

  const controls = new OrbitControls(engine.camera, engine.canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = minDistance
  controls.maxDistance = maxDistance
  controls.maxPolarAngle = maxPolarAngle
  controls.enablePan = enablePan
  controls.autoRotate = autoRotate
  controls.target.set(...target)

  const stop = engine.onLateUpdate(() => controls.update())
  engine.onDispose(() => controls.dispose())

  return {
    controls,
    dispose() {
      stop()
      controls.dispose()
    },
  }
}

/**
 * Third-person chase camera.
 *
 * Position and aim are damped separately and the aim is damped faster, which
 * is what makes a chase camera feel attached rather than dragged: the picture
 * keeps the character centred while the camera itself is still catching up.
 */
export function createFollowCamera(engine, target, options = {}) {
  const {
    offset = [0, 5, 9],
    lookOffset = [0, 1.2, 0],
    /** Seconds for half the remaining distance to close. Bigger is looser. */
    positionHalfLife = 0.12,
    lookHalfLife = 0.06,
    /** Rotate the offset with the target, so the camera stays behind it. */
    followRotation = false,
  } = options

  const desired = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  const smoothedLook = new THREE.Vector3(...lookOffset).add(target.position)
  const offsetVector = new THREE.Vector3(...offset)
  const lookOffsetVector = new THREE.Vector3(...lookOffset)

  const stop = engine.onLateUpdate((dt) => {
    desired.copy(offsetVector)
    if (followRotation) desired.applyQuaternion(target.quaternion)
    desired.add(target.position)

    dampVec3(engine.camera.position, desired, positionHalfLife, dt)

    lookAt.copy(target.position).add(lookOffsetVector)
    dampVec3(smoothedLook, lookAt, lookHalfLife, dt)
    engine.camera.lookAt(smoothedLook)
  })

  return {
    /** Jumps the camera to its resting place — call after a respawn. */
    snap() {
      desired.copy(offsetVector)
      if (followRotation) desired.applyQuaternion(target.quaternion)
      engine.camera.position.copy(desired.add(target.position))
      smoothedLook.copy(target.position).add(lookOffsetVector)
      engine.camera.lookAt(smoothedLook)
    },
    setOffset: (x, y, z) => offsetVector.set(x, y, z),
    dispose: stop,
  }
}

/**
 * Fixed-angle camera looking down at a target: top-down shooters, twin-stick,
 * isometric strategy.
 *
 * The angle is expressed as a height and a pull-back rather than as a
 * rotation, because that is how the framing is actually chosen — "how far
 * above" and "how far behind" are the two things a designer tunes.
 */
export function createTopDownCamera(engine, target, options = {}) {
  const { height = 14, back = 8, halfLife = 0.1 } = options
  const desired = new THREE.Vector3()

  const stop = engine.onLateUpdate((dt) => {
    desired.set(target.position.x, height, target.position.z + back)
    dampVec3(engine.camera.position, desired, halfLife, dt)
    engine.camera.lookAt(target.position)
  })

  return { dispose: stop }
}

/**
 * Side-on camera for platformers and runners.
 *
 * The deadzone is the whole point: a camera that tracks every pixel of a
 * jumping character makes the *world* look like it is bouncing. Nothing moves
 * until the character leaves a box in the middle of the screen.
 */
export function createSideCamera(engine, target, options = {}) {
  const {
    distance = 12,
    height = 2,
    deadzone = [2, 1.5],
    halfLife = 0.15,
  } = options

  const focus = new THREE.Vector3(target.position.x, target.position.y, 0)

  const stop = engine.onLateUpdate((dt) => {
    if (Math.abs(target.position.x - focus.x) > deadzone[0]) {
      focus.x = target.position.x - Math.sign(target.position.x - focus.x) * deadzone[0]
    }
    if (Math.abs(target.position.y - focus.y) > deadzone[1]) {
      focus.y = target.position.y - Math.sign(target.position.y - focus.y) * deadzone[1]
    }

    engine.camera.position.x = damp(
      engine.camera.position.x,
      focus.x,
      halfLife,
      dt
    )
    engine.camera.position.y = damp(
      engine.camera.position.y,
      focus.y + height,
      halfLife,
      dt
    )
    engine.camera.position.z = distance
    engine.camera.lookAt(engine.camera.position.x, engine.camera.position.y, 0)
  })

  return { dispose: stop }
}

/**
 * First-person walking, with the pointer lock the browser demands.
 *
 * Pointer lock cannot be requested without a user gesture, so this shows a
 * click-to-play prompt rather than failing silently — and it releases on
 * Escape, which the browser does anyway and which the game therefore has to
 * expect.
 */
export function createFirstPersonControls(engine, input, options = {}) {
  const {
    speed = 6,
    sprintMultiplier = 1.8,
    eyeHeight = 1.7,
    prompt = "Click to play — WASD to move, Esc to release",
  } = options

  /**
   * `PointerLockControls` rotates the camera itself, so there is no rig object
   * to add: setting the camera's height *is* setting the player's eye level.
   */
  const controls = new PointerLockControls(engine.camera, engine.canvas)
  engine.camera.position.y = eyeHeight

  const hint = document.createElement("div")
  hint.textContent = prompt
  hint.style.cssText = `
    position: absolute; inset: 0; display: grid; place-items: center;
    background: rgba(9, 9, 11, 0.55); color: #f4f4f5; cursor: pointer;
    font: 600 0.875rem/1.4 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.01em; z-index: 20;
  `
  engine.mount.appendChild(hint)

  const requestLock = () => controls.lock()
  hint.addEventListener("click", requestLock)
  controls.addEventListener("lock", () => {
    hint.style.display = "none"
  })
  controls.addEventListener("unlock", () => {
    hint.style.display = "grid"
  })

  const move = new THREE.Vector2()
  const stop = engine.onUpdate((dt) => {
    if (!controls.isLocked) return
    input.moveVector(move)
    const scale = speed * dt * (input.down("ShiftLeft") ? sprintMultiplier : 1)
    controls.moveRight(move.x * scale)
    controls.moveForward(move.y * scale)
  })

  return {
    controls,
    get locked() {
      return controls.isLocked
    },
    lock: requestLock,
    dispose() {
      stop()
      hint.remove()
      controls.dispose()
    },
  }
}

/**
 * Turns keyboard input into camera-relative movement for a character.
 *
 * "Forward" in a third-person game means "away from the camera", not "-Z in
 * world space" — get that wrong and the controls invert every time the camera
 * swings round. This also turns the model to face where it is going, damped,
 * because a character that snaps to a new heading looks like a sprite rather
 * than a body.
 *
 * It writes into `body.velocity` when given a physics body, and moves the
 * object directly otherwise, so it works with or without `physics.js`.
 */
export function createPlayerMotor(engine, input, object, options = {}) {
  const {
    speed = 6,
    sprintMultiplier = 1.7,
    turnHalfLife = 0.05,
    body = null,
    /** Lock movement to the XZ plane's cardinal directions, for 2D games. */
    planar = false,
  } = options

  const move = new THREE.Vector2()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const direction = new THREE.Vector3()

  const stop = engine.onUpdate((dt) => {
    input.moveVector(move)

    if (planar) {
      direction.set(move.x, 0, -move.y)
    } else {
      /**
       * The camera's forward flattened onto the ground plane: keeping the Y
       * component would make the character walk into the floor whenever the
       * camera looks down.
       */
      engine.camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      right.crossVectors(forward, engine.camera.up).normalize()
      direction
        .set(0, 0, 0)
        .addScaledVector(forward, move.y)
        .addScaledVector(right, move.x)
    }

    const scale = speed * (input.down("ShiftLeft") ? sprintMultiplier : 1)
    const moving = direction.lengthSq() > 0.0001

    if (body) {
      body.velocity.x = direction.x * scale
      body.velocity.z = direction.z * scale
    } else if (moving) {
      object.position.addScaledVector(direction, scale * dt)
    }

    if (moving) {
      const heading = Math.atan2(direction.x, direction.z)
      object.rotation.y = dampAngle(
        object.rotation.y,
        heading,
        turnHalfLife,
        dt
      )
    }

    motor.moving = moving
    motor.speed = moving ? scale : 0
  })

  const motor = { moving: false, speed: 0, direction, dispose: stop }
  return motor
}

/**
 * Free-flying debug camera on WASD + mouse drag. Not a game camera — a way to
 * look at a level while building it.
 */
export function createFlyCamera(engine, input, options = {}) {
  const { speed = 12, lookSpeed = 0.0025 } = options
  let yaw = engine.camera.rotation.y
  let pitch = engine.camera.rotation.x
  const move = new THREE.Vector2()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()

  const stop = engine.onUpdate((dt) => {
    if (input.mouseDown(0)) {
      yaw -= input.delta.x * lookSpeed
      pitch = clamp(pitch - input.delta.y * lookSpeed, -1.5, 1.5)
      engine.camera.rotation.set(pitch, yaw % TAU, 0, "YXZ")
    }

    input.moveVector(move)
    engine.camera.getWorldDirection(forward)
    right.crossVectors(forward, engine.camera.up).normalize()
    engine.camera.position
      .addScaledVector(forward, move.y * speed * dt)
      .addScaledVector(right, move.x * speed * dt)
    if (input.down("KeyQ")) engine.camera.position.y -= speed * dt
    if (input.down("KeyE")) engine.camera.position.y += speed * dt
  })

  return { dispose: stop }
}
