/**
 * Touch controls: a virtual stick, a look-drag half of the screen, and a row
 * of on-screen buttons.
 *
 * None of it is a separate input system. Every piece here writes through
 * `input.virtual` — the same `held`, `pressedThisFrame` and axis state a
 * keyboard and mouse write to — so a game that already calls
 * `input.moveVector()`, `input.down("Space")` or reads `input.delta` needs
 * no touch-specific branch of its own to run on a phone.
 */

const STYLE_ID = "engine-touch-style"

/**
 * One stylesheet for every touch overlay, injected once — the same pattern
 * `hud.js` uses, and for the same reason: a game can create more than one of
 * these without duplicating a `<style>` tag per instance.
 */
const CSS = `
[data-touch-controls] {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  position: relative;
  pointer-events: none;
  /**
   * The touch surface covers the whole HUD grid, so without an explicit
   * stacking order it would sit above or below \`hud.panel()\` depending on
   * nothing more meaningful than which one a game happened to create first.
   * \`.hud-panel\` claims \`z-index: 1\` for exactly that reason — see hud.js.
   */
  z-index: 0;
}
[data-touch-surface] {
  position: absolute;
  top: env(safe-area-inset-top);
  right: env(safe-area-inset-right);
  bottom: env(safe-area-inset-bottom);
  left: env(safe-area-inset-left);
  pointer-events: auto;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.touch-stick {
  position: absolute;
  width: 96px;
  height: 96px;
  margin: -48px 0 0 -48px;
  border-radius: 50%;
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  display: none;
}
.touch-stick__knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border-radius: 50%;
  background: var(--hud-accent);
  opacity: 0.85;
}
.touch-buttons {
  position: absolute;
  right: calc(16px + env(safe-area-inset-right));
  bottom: calc(16px + env(safe-area-inset-bottom));
  display: flex;
  gap: 14px;
  pointer-events: none;
}
.touch-button {
  pointer-events: auto;
  appearance: none;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--hud-fg);
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  font: 650 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    sans-serif;
  touch-action: none;
  -webkit-touch-callout: none;
  user-select: none;
}
.touch-button--active {
  background: var(--hud-accent);
  color: #08090d;
}
`

/**
 * Builds the touch overlay and wires it into `input.virtual`.
 *
 * @param {ReturnType<import("./engine.js").createEngine>} engine
 * @param {ReturnType<import("./input.js").createInput>} input
 * @param {ReturnType<import("./hud.js").createHud>} hud
 * @param {object} [spec]
 * @param {"left"|"right"|false} [spec.stick] Which half drives the move stick.
 * @param {"left"|"right"|false} [spec.look] Which half drives the look drag.
 * @param {{label: string, code: string, hold?: boolean}[]} [spec.buttons]
 * @param {"auto"|"always"|"never"} [spec.show]
 */
export function createTouchControls(engine, input, hud, spec = {}) {
  const { stick = "left", look = "right", buttons = [], show = "auto" } = spec

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  const element = document.createElement("div")
  element.dataset.touchControls = ""
  hud.root.appendChild(element)

  /**
   * One hit-testing layer under everything else, rather than a separate
   * element per half: a single `pointerdown` on it can look at where the
   * touch landed and decide stick or look, which is what makes "the stick
   * wins where the halves overlap" a one-line check instead of a race
   * between two listeners on two elements.
   */
  const surface = document.createElement("div")
  surface.dataset.touchSurface = ""
  element.appendChild(surface)

  const stickBase = document.createElement("div")
  stickBase.className = "touch-stick"
  stickBase.innerHTML = `<div class="touch-stick__knob"></div>`
  const stickKnob = stickBase.firstElementChild
  element.appendChild(stickBase)

  const buttonsRow = document.createElement("div")
  buttonsRow.className = "touch-buttons"
  element.appendChild(buttonsRow)

  const STICK_RADIUS = 44
  let stickPointerId = null
  let stickOrigin = { x: 0, y: 0 }

  let lookPointerId = null
  let lookX = 0
  let lookY = 0

  function halfOf(clientX) {
    /**
     * Against `element`'s rect, the same one `startStick` uses to place the
     * knob: `surface` is inset from `element` by the safe-area variables, so
     * measuring the half against one rect and the knob's position against
     * the other would let a notched device's inset quietly shift the stick
     * away from the finger that placed it.
     */
    const rect = element.getBoundingClientRect()
    return clientX - rect.left < rect.width / 2 ? "left" : "right"
  }

  /**
   * The stick appears wherever the thumb lands rather than living in a fixed
   * spot: a resting grip varies with the device and the hand, and a stick
   * nailed to one corner is out of reach half the time.
   */
  function startStick(event) {
    stickPointerId = event.pointerId
    surface.setPointerCapture(stickPointerId)
    stickOrigin = { x: event.clientX, y: event.clientY }
    const rect = element.getBoundingClientRect()
    stickBase.style.left = `${event.clientX - rect.left}px`
    stickBase.style.top = `${event.clientY - rect.top}px`
    stickBase.style.display = "block"
    stickKnob.style.transform = "translate(-50%, -50%)"
  }

  function moveStick(event) {
    const dx = event.clientX - stickOrigin.x
    const dy = event.clientY - stickOrigin.y
    const distance = Math.min(Math.hypot(dx, dy), STICK_RADIUS)
    const angle = Math.atan2(dy, dx)
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance
    stickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
    /**
     * `-y`: screen coordinates grow downward, but `moveVector` treats
     * positive y as forward — the camera looks down -Z — so left uninverted
     * every push forward on the stick would walk the player backwards.
     */
    input.virtual.setAxis(x / STICK_RADIUS, -(y / STICK_RADIUS))
  }

  function endStick() {
    stickPointerId = null
    stickBase.style.display = "none"
    input.virtual.setAxis(0, 0)
  }

  function startLook(event) {
    lookPointerId = event.pointerId
    surface.setPointerCapture(lookPointerId)
    lookX = event.clientX
    lookY = event.clientY
  }

  function moveLook(event) {
    /**
     * Measured against the previous position rather than `movementX` — the
     * same gap `input.js` works around for `input.delta`, since a touch
     * pointer never reports it — so a look-drag behaves exactly like a mouse
     * drag once it reaches `addLook`.
     */
    const dx = event.clientX - lookX
    const dy = event.clientY - lookY
    lookX = event.clientX
    lookY = event.clientY
    input.virtual.addLook(dx, dy)
  }

  function endLook() {
    lookPointerId = null
  }

  const onSurfaceDown = (event) => {
    const half = halfOf(event.clientX)
    if (stick && stickPointerId === null && half === stick) {
      startStick(event)
    } else if (look && lookPointerId === null && half === look) {
      startLook(event)
    }
  }

  const onSurfaceMove = (event) => {
    if (event.pointerId === stickPointerId) moveStick(event)
    else if (event.pointerId === lookPointerId) moveLook(event)
  }

  const onSurfaceUp = (event) => {
    if (event.pointerId === stickPointerId) endStick()
    else if (event.pointerId === lookPointerId) endLook()
  }

  surface.addEventListener("pointerdown", onSurfaceDown)
  surface.addEventListener("pointermove", onSurfaceMove)
  surface.addEventListener("pointerup", onSurfaceUp)
  /**
   * iOS fires `pointercancel` constantly — a scroll, a system gesture, an
   * incoming call — and a stick that only lets go on `pointerup` is a stick
   * that gets stuck pushing the player into a wall the next time that
   * happens.
   */
  surface.addEventListener("pointercancel", onSurfaceUp)

  const buttonCleanups = []
  for (const { label, code, hold = false } of buttons) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "touch-button"
    button.textContent = label
    buttonsRow.appendChild(button)

    let buttonPointerId = null
    /**
     * Set while a pulse's next-frame release is still pending, so a finger
     * lifted early can cancel it and release right away instead of leaving
     * two releases racing each other.
     */
    let cancelPendingRelease = null

    const onDown = (event) => {
      /** Stops the synthetic double-tap zoom and the 300ms click delay. */
      event.preventDefault()
      buttonPointerId = event.pointerId
      button.setPointerCapture(buttonPointerId)
      button.classList.add("touch-button--active")
      input.virtual.press(code)
      if (!hold) {
        /**
         * Released one frame later instead of on finger-up, so a pulse
         * button reads as a single keypress no matter how long it is held —
         * exactly like `pressed()` for a real key, which fires once
         * regardless of how long the key stays down.
         */
        const stopLate = engine.onLateUpdate(() => {
          cancelPendingRelease = null
          input.virtual.release(code)
          stopLate()
        })
        cancelPendingRelease = stopLate
      }
    }

    const onUp = (event) => {
      if (event.pointerId !== buttonPointerId) return
      buttonPointerId = null
      button.classList.remove("touch-button--active")
      if (hold) {
        input.virtual.release(code)
      } else if (cancelPendingRelease) {
        /**
         * The next-frame release above only runs if the engine's late phase
         * runs at all — but `hud.panel()` calls `engine.pause()` while it is
         * open, and the loop never runs before `engine.start()` either. A
         * release that depends on the loop is a release that never happens
         * exactly when a menu is on screen, so a pulse pressed there would
         * leave its code stuck in `held` forever. Cancelling the scheduled
         * one and releasing here the moment the finger lifts closes that gap
         * without changing the one-frame `pressed()` edge for the normal,
         * loop-is-running case.
         */
        cancelPendingRelease()
        cancelPendingRelease = null
        input.virtual.release(code)
      }
    }

    button.addEventListener("pointerdown", onDown)
    button.addEventListener("pointerup", onUp)
    button.addEventListener("pointercancel", onUp)
    buttonCleanups.push(() => {
      button.removeEventListener("pointerdown", onDown)
      button.removeEventListener("pointerup", onUp)
      button.removeEventListener("pointercancel", onUp)
    })
  }

  /**
   * `"auto"` keys off the pointer's own capability rather than the user
   * agent or the screen size, so a touch laptop stays keyboard-only and a
   * phone with a Bluetooth keyboard still gets its stick — capability is the
   * only signal that does not lie in either direction. Keyboard and mouse
   * listeners in `input.js` are never touched either way, so both work at
   * once on a device that has both.
   */
  const coarse =
    show === "auto" ? (window.matchMedia?.("(pointer: coarse)") ?? null) : null

  function applyVisibility() {
    const visible =
      show === "always" ? true : show === "never" ? false : !!coarse?.matches
    element.style.display = visible ? "" : "none"
  }
  applyVisibility()
  coarse?.addEventListener?.("change", applyVisibility)

  function dispose() {
    surface.removeEventListener("pointerdown", onSurfaceDown)
    surface.removeEventListener("pointermove", onSurfaceMove)
    surface.removeEventListener("pointerup", onSurfaceUp)
    surface.removeEventListener("pointercancel", onSurfaceUp)
    for (const cleanup of buttonCleanups) cleanup()
    coarse?.removeEventListener?.("change", applyVisibility)
    element.remove()
  }

  /** The preview reloads on every chat turn, and a leak per reload is a leak per edit. */
  engine.onDispose(dispose)

  return { element, dispose }
}
