/**
 * Input as state you poll, not events you react to.
 *
 * Games ask "is the player holding right *this frame*", and answering that
 * from a `keydown` listener means every game re-invents the same map of booleans
 * — usually without the parts that matter: an edge trigger that fires once per
 * press, a key that stays stuck down because the window lost focus mid-press,
 * and a `preventDefault` so the arrow keys scroll the page instead of moving
 * the player.
 */

import * as THREE from "three"

/**
 * Keys whose default browser behaviour ruins a game: arrows and space scroll
 * the page, and `/` opens quick-find in some browsers.
 */
const SWALLOWED = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Slash",
])

/**
 * Starts tracking keyboard, pointer and gamepad state.
 *
 * Pass the engine and it wires itself into the loop; the per-frame edge state
 * (`pressed`, `released`, `wheel`) is cleared after every update, so those are
 * only true on the single frame the thing happened.
 */
export function createInput(engine, options = {}) {
  const { swallow = true, target = engine.canvas } = options

  const held = new Set()
  const pressedThisFrame = new Set()
  const releasedThisFrame = new Set()
  const buttons = new Set()
  const buttonsPressed = new Set()
  const buttonsReleased = new Set()

  /** Pointer position in pixels, and in the -1..1 space raycasting wants. */
  const pointer = { x: 0, y: 0, ndc: new THREE.Vector2(), inside: false }
  const delta = { x: 0, y: 0 }
  let wheel = 0

  const onKeyDown = (event) => {
    if (event.repeat) return
    if (swallow && SWALLOWED.has(event.code)) event.preventDefault()
    held.add(event.code)
    pressedThisFrame.add(event.code)
  }

  const onKeyUp = (event) => {
    held.delete(event.code)
    releasedThisFrame.add(event.code)
  }

  /**
   * A key held while the window loses focus never sends its `keyup`, so the
   * player comes back to a character walking into a wall forever.
   */
  const onBlur = () => {
    for (const code of held) releasedThisFrame.add(code)
    held.clear()
    buttons.clear()
  }

  const onPointerMove = (event) => {
    const rect = target.getBoundingClientRect()
    pointer.x = event.clientX - rect.left
    pointer.y = event.clientY - rect.top
    pointer.inside =
      pointer.x >= 0 &&
      pointer.y >= 0 &&
      pointer.x <= rect.width &&
      pointer.y <= rect.height
    pointer.ndc.set(
      (pointer.x / rect.width) * 2 - 1,
      -(pointer.y / rect.height) * 2 + 1
    )
    /**
     * `movementX` rather than a difference of positions: it keeps working
     * under pointer lock, where the position stops moving entirely.
     */
    delta.x += event.movementX ?? 0
    delta.y += event.movementY ?? 0
  }

  const onPointerDown = (event) => {
    buttons.add(event.button)
    buttonsPressed.add(event.button)
  }

  const onPointerUp = (event) => {
    buttons.delete(event.button)
    buttonsReleased.add(event.button)
  }

  const onWheel = (event) => {
    if (swallow) event.preventDefault()
    wheel += event.deltaY
  }

  /** Right-click is a camera button in plenty of games; the menu is not. */
  const onContextMenu = (event) => {
    if (swallow) event.preventDefault()
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", onBlur)
  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerup", onPointerUp)
  target.addEventListener("pointerdown", onPointerDown)
  target.addEventListener("wheel", onWheel, { passive: false })
  target.addEventListener("contextmenu", onContextMenu)

  const input = {
    pointer,
    /** Pointer movement since the last frame, in pixels. Survives pointer lock. */
    delta,

    /** True while the key is down. Codes are `event.code`: "KeyW", "Space". */
    down: (...codes) => codes.some((code) => held.has(code)),
    /** True only on the frame the key went down. */
    pressed: (...codes) => codes.some((code) => pressedThisFrame.has(code)),
    /** True only on the frame the key came up. */
    released: (...codes) => codes.some((code) => releasedThisFrame.has(code)),

    mouseDown: (button = 0) => buttons.has(button),
    mousePressed: (button = 0) => buttonsPressed.has(button),
    mouseReleased: (button = 0) => buttonsReleased.has(button),
    get wheel() {
      return wheel
    },

    /** -1, 0 or 1 from a pair of opposed keys. */
    axis(negative, positive) {
      return (input.down(positive) ? 1 : 0) - (input.down(negative) ? 1 : 0)
    },

    /**
     * WASD and the arrows as one vector, normalised so that walking diagonally
     * is not 41% faster than walking straight — the classic first bug of every
     * top-down game.
     *
     * `y` is forward: the camera looks down -Z, so "up" on the keyboard means
     * -Z in the world, and the caller reads `-vector.y` for the Z axis.
     */
    moveVector(target = new THREE.Vector2()) {
      target.set(
        input.axis("KeyA", "KeyD") + input.axis("ArrowLeft", "ArrowRight"),
        input.axis("KeyS", "KeyW") + input.axis("ArrowDown", "ArrowUp")
      )
      if (target.lengthSq() > 1) target.normalize()
      return target
    },

    /**
     * The first connected gamepad, or null. Read fresh each frame: the browser
     * hands back a snapshot, and a cached one never changes.
     */
    gamepad() {
      return navigator.getGamepads?.().find(Boolean) ?? null
    },

    /** Clears the per-frame edges. The engine calls this; games do not. */
    endFrame() {
      pressedThisFrame.clear()
      releasedThisFrame.clear()
      buttonsPressed.clear()
      buttonsReleased.clear()
      delta.x = 0
      delta.y = 0
      wheel = 0
    },

    dispose() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      target.removeEventListener("pointerdown", onPointerDown)
      target.removeEventListener("wheel", onWheel)
      target.removeEventListener("contextmenu", onContextMenu)
    },
  }

  /**
   * Registered as a *late* handler so it runs after all game logic: an edge
   * cleared before the last `onUpdate` reads it is an input the game never
   * saw.
   */
  engine.onLateUpdate(() => input.endFrame())
  engine.onDispose(() => input.dispose())

  return input
}

/**
 * Raycasting against the scene, phrased the way games ask for it.
 *
 * Both of the questions below come up constantly — "what did the player click"
 * and "where on the ground is the cursor" — and both are three or four lines
 * of vector work that are easy to get subtly wrong.
 */
export function createPicker(engine, input) {
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  return {
    raycaster,

    /** The nearest object under the pointer, with its hit point and normal. */
    pick(objects = engine.scene.children, recursive = true) {
      raycaster.setFromCamera(input.pointer.ndc, engine.camera)
      return raycaster.intersectObjects(objects, recursive)[0] ?? null
    },

    /**
     * Where the pointer lands on a horizontal plane at height `y` — the answer
     * a strategy game, a tower defence or a click-to-move game actually wants,
     * and one that needs no geometry to hit.
     */
    pickGround(y = 0, target = new THREE.Vector3()) {
      plane.constant = -y
      raycaster.setFromCamera(input.pointer.ndc, engine.camera)
      return raycaster.ray.intersectPlane(plane, target)
    },
  }
}
