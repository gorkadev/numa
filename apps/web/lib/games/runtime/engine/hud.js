/**
 * The interface layer, in DOM rather than in 3D.
 *
 * Drawing a score with geometry means a font, a texture atlas and a camera
 * that has to stay out of the way. Drawing it with an absolutely positioned
 * `<div>` over the canvas means real text, real layout, crisp at any pixel
 * ratio, and screen-reader-legible for free. There is no reason to do it the
 * hard way.
 *
 * Everything is `pointer-events: none` by default. A HUD that eats clicks is a
 * HUD that breaks aiming, and only the pieces that are actually buttons opt
 * back in.
 */

import * as THREE from "three"

const STYLE_ID = "engine-hud-style"

/**
 * One stylesheet for every HUD, injected once.
 *
 * The colours are custom properties so a game can retheme the whole interface
 * with a single `hud.theme({ accent })` call rather than restyling elements it
 * did not create.
 */
const CSS = `
[data-hud] {
  --hud-fg: #f4f4f5;
  --hud-dim: rgba(244, 244, 245, 0.62);
  --hud-bg: rgba(12, 14, 22, 0.62);
  --hud-line: rgba(255, 255, 255, 0.14);
  --hud-accent: #4aa8ff;
  --hud-danger: #ff5a5f;
  --hud-radius: 12px;
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  padding: 16px;
  color: var(--hud-fg);
  font: 500 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    sans-serif;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
[data-hud-slot] { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
[data-hud-slot$="left"] { align-items: flex-start; }
[data-hud-slot$="center"] { align-items: center; }
[data-hud-slot$="right"] { align-items: flex-end; }
[data-hud-slot^="middle"] { justify-content: center; }
[data-hud-slot^="bottom"] { justify-content: flex-end; }

.hud-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 12px;
  border-radius: var(--hud-radius);
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  backdrop-filter: blur(8px);
  white-space: nowrap;
}
.hud-chip__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hud-dim);
}
.hud-chip__value {
  /* Tabular figures: a score without them jitters as digits change width. */
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 700;
}

.hud-bar { width: 180px; }
.hud-bar__track {
  height: 9px;
  border-radius: 999px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  overflow: hidden;
}
.hud-bar__fill {
  height: 100%;
  width: 100%;
  border-radius: inherit;
  background: var(--hud-accent);
  transform-origin: left center;
  transition: transform 0.18s ease-out, background-color 0.2s linear;
}

.hud-panel {
  pointer-events: auto;
  min-width: 260px;
  max-width: min(90%, 420px);
  padding: 28px;
  border-radius: 18px;
  background: rgba(12, 14, 22, 0.82);
  border: 1px solid var(--hud-line);
  backdrop-filter: blur(14px);
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  animation: hud-rise 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.hud-panel__title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.hud-panel__body { margin: 0 0 20px; color: var(--hud-dim); font-size: 14px; }
.hud-panel__actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

.hud-button {
  pointer-events: auto;
  appearance: none;
  cursor: pointer;
  font: inherit;
  font-weight: 650;
  padding: 10px 20px;
  border-radius: 10px;
  color: #08090d;
  background: var(--hud-accent);
  border: 0;
  transition: transform 0.12s ease-out, filter 0.12s ease-out;
}
.hud-button:hover { filter: brightness(1.08); }
.hud-button:active { transform: translateY(1px) scale(0.98); }
.hud-button--ghost {
  background: transparent;
  color: var(--hud-fg);
  border: 1px solid var(--hud-line);
}

.hud-keys { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; color: var(--hud-dim); font-size: 12px; }
.hud-keys__row { display: flex; align-items: center; gap: 6px; }
.hud-keys kbd {
  font: inherit;
  font-weight: 700;
  color: var(--hud-fg);
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  border-bottom-width: 2px;
}

.hud-toast {
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  backdrop-filter: blur(8px);
  animation: hud-rise 0.22s ease-out;
}
.hud-toast--leaving { animation: hud-fade 0.25s ease-in forwards; }

.hud-crosshair {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.75);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  opacity: 0.85;
}

@keyframes hud-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.97); }
  to { opacity: 1; transform: none; }
}
@keyframes hud-fade {
  to { opacity: 0; transform: translateY(-6px); }
}

/*
 * The player may have asked their system for less movement. Honour it: the
 * information still arrives, it just stops sliding in.
 */
@media (prefers-reduced-motion: reduce) {
  [data-hud] * { animation: none !important; transition: none !important; }
}
`

/**
 * Creates the overlay and returns builders for the pieces games actually use.
 *
 * Every builder returns a handle with `set`/`remove` rather than a raw
 * element, so updating the score from the game loop never involves finding a
 * node or rebuilding a string of HTML.
 */
export function createHud(engine, options = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)
  }

  const root = document.createElement("div")
  root.dataset.hud = ""
  engine.mount.appendChild(root)

  const slots = new Map()

  /**
   * Slots are created on demand and placed on a 3x3 grid, so two widgets
   * asking for "top-left" stack instead of overlapping — the failure mode of
   * every hand-rolled absolutely-positioned HUD.
   */
  function slot(name = "top-left") {
    if (slots.has(name)) return slots.get(name)
    const [row, column] = name.split("-")
    const element = document.createElement("div")
    element.dataset.hudSlot = name
    element.style.gridRow = { top: "1", middle: "2", bottom: "3" }[row] ?? "1"
    element.style.gridColumn =
      { left: "1", center: "2", right: "3" }[column] ?? "1"
    root.appendChild(element)
    slots.set(name, element)
    return element
  }

  if (options.theme) applyTheme(options.theme)

  function applyTheme(theme) {
    for (const [key, value] of Object.entries(theme)) {
      root.style.setProperty(`--hud-${key}`, value)
    }
  }

  const hud = {
    root,
    slot,
    theme: applyTheme,

    /**
     * A labelled number — score, lives, ammo, time.
     *
     * `set` takes the value alone, so the game loop writes `score.set(points)`
     * and never has to remember the label.
     */
    stat(label, value = 0, position = "top-left") {
      const element = document.createElement("div")
      element.className = "hud-chip"
      element.innerHTML = `<span class="hud-chip__label"></span><span class="hud-chip__value"></span>`
      const labelNode = element.firstElementChild
      const valueNode = element.lastElementChild
      labelNode.textContent = label
      valueNode.textContent = value
      slot(position).appendChild(element)

      return {
        element,
        set(next) {
          valueNode.textContent = next
          return this
        },
        label(next) {
          labelNode.textContent = next
          return this
        },
        remove: () => element.remove(),
      }
    },

    /**
     * A 0..1 meter — health, fuel, a charge-up.
     *
     * Scaled with a transform rather than a width, so the browser animates it
     * on the compositor and never reflows the page mid-frame.
     */
    bar(label, position = "top-left", options = {}) {
      const { color = "var(--hud-accent)", dangerBelow = 0.3 } = options
      const element = document.createElement("div")
      element.className = "hud-bar"
      element.innerHTML = `
        <div class="hud-chip" style="margin-bottom:6px"><span class="hud-chip__label"></span></div>
        <div class="hud-bar__track"><div class="hud-bar__fill"></div></div>`
      element.querySelector(".hud-chip__label").textContent = label
      const fill = element.querySelector(".hud-bar__fill")
      fill.style.background = color
      slot(position).appendChild(element)

      return {
        element,
        set(value) {
          const clamped = Math.max(0, Math.min(1, value))
          fill.style.transform = `scaleX(${clamped})`
          fill.style.background =
            clamped <= dangerBelow ? "var(--hud-danger)" : color
          return this
        },
        remove: () => element.remove(),
      }
    },

    /** Free-form text. Objectives, hints, a countdown. */
    text(content = "", position = "top-center") {
      const element = document.createElement("div")
      element.className = "hud-chip"
      element.textContent = content
      slot(position).appendChild(element)
      return {
        element,
        set(next) {
          element.textContent = next
          return this
        },
        show: () => (element.style.display = ""),
        hide: () => (element.style.display = "none"),
        remove: () => element.remove(),
      }
    },

    /**
     * The controls, on screen.
     *
     * A game whose controls are only in the chat is a game the player cannot
     * play; this is cheap enough that there is no excuse for leaving it out.
     */
    keys(rows, position = "bottom-center") {
      const element = document.createElement("div")
      element.className = "hud-keys"
      element.innerHTML = rows
        .map(
          ({ keys, label }) =>
            `<span class="hud-keys__row">${keys
              .map((key) => `<kbd>${key}</kbd>`)
              .join("")}<span>${label}</span></span>`
        )
        .join("")
      slot(position).appendChild(element)
      return { element, remove: () => element.remove() }
    },

    /** A dot in the middle of the screen, for anything aimed. */
    crosshair() {
      const element = document.createElement("div")
      element.className = "hud-crosshair"
      slot("middle-center").appendChild(element)
      return { element, remove: () => element.remove() }
    },

    /**
     * A full-screen card: title screen, pause, game over, level complete.
     *
     * It pauses the engine while it is up and resumes on dismissal, because a
     * menu over a world that keeps simulating is how players die while reading
     * the instructions.
     */
    panel({ title, body = "", actions = [], pause = true }) {
      const element = document.createElement("div")
      element.className = "hud-panel"
      element.innerHTML = `
        <h2 class="hud-panel__title"></h2>
        <p class="hud-panel__body"></p>
        <div class="hud-panel__actions"></div>`
      element.querySelector(".hud-panel__title").textContent = title
      element.querySelector(".hud-panel__body").textContent = body

      const close = () => {
        element.remove()
        if (pause) engine.resume()
      }

      const actionRow = element.querySelector(".hud-panel__actions")
      for (const action of actions) {
        const button = document.createElement("button")
        button.className = `hud-button${action.ghost ? " hud-button--ghost" : ""}`
        button.textContent = action.label
        button.addEventListener("click", () => {
          close()
          action.onClick?.()
        })
        actionRow.appendChild(button)
      }

      slot("middle-center").appendChild(element)
      if (pause) engine.pause()
      /** Focused so Enter and Space work without reaching for the mouse. */
      actionRow.querySelector("button")?.focus()

      return { element, close }
    },

    /** A message that says its piece and leaves. */
    toast(message, duration = 1.8) {
      const element = document.createElement("div")
      element.className = "hud-toast"
      element.textContent = message
      slot("top-center").appendChild(element)

      setTimeout(() => {
        element.classList.add("hud-toast--leaving")
        setTimeout(() => element.remove(), 250)
      }, duration * 1000)

      return { element, remove: () => element.remove() }
    },

    /**
     * Anchors an element to a world position — nameplates, damage numbers,
     * waypoint markers.
     *
     * Hidden when the point is behind the camera: `project` mirrors points
     * behind the viewer onto the screen, so without the depth check a marker
     * for something at your back appears in front of you.
     */
    follow(object, options = {}) {
      const { offset = [0, 2, 0], content = "" } = options
      const element = document.createElement("div")
      element.className = "hud-chip"
      element.textContent = content
      element.style.position = "absolute"
      element.style.transform = "translate(-50%, -50%)"
      root.appendChild(element)

      const position = new THREE.Vector3()
      const stop = engine.onLateUpdate(() => {
        position.set(
          object.position.x + offset[0],
          object.position.y + offset[1],
          object.position.z + offset[2]
        )
        position.project(engine.camera)
        const visible = position.z < 1
        element.style.display = visible ? "" : "none"
        if (!visible) return
        element.style.left = `${((position.x + 1) / 2) * engine.size.width}px`
        element.style.top = `${((1 - position.y) / 2) * engine.size.height}px`
      })

      return {
        element,
        set(next) {
          element.textContent = next
        },
        remove() {
          stop()
          element.remove()
        },
      }
    },

    clear() {
      for (const element of slots.values()) element.replaceChildren()
    },

    dispose() {
      root.remove()
      slots.clear()
    },
  }

  engine.onDispose(() => hud.dispose())
  return hud
}
