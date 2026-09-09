/**
 * The thing every game starts with: a renderer, a scene, a camera, a loop.
 *
 * Written as one `createEngine()` call because the boilerplate around those
 * four objects is where browser games quietly go wrong — a pixel ratio that
 * melts a laptop, a resize handler that stretches the picture, a loop whose
 * speed depends on the monitor, an exception that stops the frame and leaves a
 * frozen image with no explanation. All of that is handled here once so a game
 * can be about the game.
 */

import * as THREE from "three"

/**
 * Creates the renderer, scene, camera and loop, and returns them together with
 * the hooks a game uses to drive them.
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.mount] Element to fill. Defaults to `body`.
 * @param {number|string} [options.background] Scene background colour.
 * @param {number|false} [options.fog] Fog colour; `false` disables it.
 * @param {[number, number]} [options.fogRange] Near/far distance of the fog.
 * @param {number} [options.fov]
 * @param {[number, number, number]} [options.cameraPosition]
 * @param {[number, number, number]} [options.lookAt]
 * @param {boolean} [options.orthographic] Isometric/2.5D framing.
 * @param {number} [options.frustumSize] Visible height, orthographic only.
 * @param {boolean} [options.shadows]
 * @param {boolean} [options.antialias]
 * @param {number} [options.maxPixelRatio]
 * @param {number} [options.fixedStep] Seconds per `onFixedUpdate` tick.
 */
export function createEngine(options = {}) {
  const {
    mount = document.body,
    background = 0x0b1020,
    fog = false,
    fogRange = [20, 120],
    fov = 60,
    near = 0.1,
    far = 1000,
    cameraPosition = [0, 4, 10],
    lookAt = [0, 0, 0],
    orthographic = false,
    frustumSize = 12,
    shadows = true,
    antialias = true,
    maxPixelRatio = 2,
    fixedStep = 1 / 60,
  } = options

  const renderer = new THREE.WebGLRenderer({
    antialias,
    powerPreference: "high-performance",
  })

  /**
   * Capped rather than taken from the device: a 3x retina display asks for
   * nine times the pixels of a 1x one, and the frame budget is the same on
   * both. Two is the point past which almost nobody can see the difference.
   */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.touchAction = "none"
  /**
   * Focusable, and focused on the first click. The game runs in an iframe, so
   * key events only arrive once something inside it has focus — without this a
   * player who clicks the canvas and presses a key gets nothing.
   */
  canvas.tabIndex = 0
  canvas.style.outline = "none"
  canvas.addEventListener("pointerdown", () => canvas.focus())

  /**
   * The mount needs to be a positioned box: the HUD and the failure overlay
   * are absolutely positioned children of it, and `position: static` would
   * anchor them to the page instead.
   */
  const mountStyle = getComputedStyle(mount)
  if (mountStyle.position === "static") mount.style.position = "relative"
  if (mount === document.body) {
    document.documentElement.style.height = "100%"
    document.body.style.height = "100%"
    document.body.style.margin = "0"
    document.body.style.overflow = "hidden"
  }
  mount.appendChild(canvas)

  const scene = new THREE.Scene()
  if (background !== false) scene.background = new THREE.Color(background)
  if (fog !== false) {
    scene.fog = new THREE.Fog(fog === true ? background : fog, ...fogRange)
  }

  const camera = orthographic
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, near, far)
    : new THREE.PerspectiveCamera(fov, 1, near, far)
  camera.position.set(...cameraPosition)
  camera.lookAt(new THREE.Vector3(...lookAt))
  scene.add(camera)

  const size = { width: 1, height: 1, aspect: 1 }
  const updateHandlers = new Set()
  const fixedHandlers = new Set()
  const lateHandlers = new Set()
  const resizeHandlers = new Set()
  const disposers = new Set()

  let renderFrame = () => renderer.render(scene, camera)
  let frameId = null
  let running = false
  let paused = false
  let accumulator = 0
  let lastTime = 0
  let elapsed = 0

  function resize() {
    const width = Math.max(1, mount.clientWidth || window.innerWidth)
    const height = Math.max(1, mount.clientHeight || window.innerHeight)
    size.width = width
    size.height = height
    size.aspect = width / height

    if (camera.isPerspectiveCamera) {
      camera.aspect = size.aspect
    } else {
      const halfHeight = frustumSize / 2
      const halfWidth = halfHeight * size.aspect
      camera.left = -halfWidth
      camera.right = halfWidth
      camera.top = halfHeight
      camera.bottom = -halfHeight
    }
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)

    for (const handler of resizeHandlers) handler(size)
  }

  /**
   * Watched on the element rather than on `window`. The game is framed inside
   * the app's preview pane, which can change size while the window does not —
   * a `resize` listener alone would leave the picture stretched.
   */
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()

  function frame(now) {
    frameId = requestAnimationFrame(frame)

    /**
     * Clamped, not raw. A backgrounded tab or a long garbage collection can
     * hand back a delta of several seconds, and every game that integrates it
     * teleports its player through a wall. Losing time is always the better
     * failure.
     */
    const dt = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now
    if (paused) return

    elapsed += dt
    engine.dt = dt
    engine.elapsed = elapsed

    try {
      accumulator += dt
      let steps = 0
      while (accumulator >= fixedStep && steps < 5) {
        for (const handler of fixedHandlers) handler(fixedStep, engine)
        accumulator -= fixedStep
        steps++
      }
      /**
       * Dropped rather than repaid when the loop falls far behind. Carrying
       * the debt forward makes a slow machine run more physics steps per
       * frame, which makes it slower still.
       */
      if (steps >= 5) accumulator = 0

      for (const handler of updateHandlers) handler(dt, engine)
      for (const handler of lateHandlers) handler(dt, engine)
      renderFrame(dt, engine)
    } catch (error) {
      fail(error)
    }
  }

  /**
   * Shows a failure on screen and stops the loop.
   *
   * The player has no console. An uncaught exception inside the loop would
   * otherwise present as a still image, which is indistinguishable from a
   * game that is simply boring — and it would keep throwing sixty times a
   * second.
   */
  function fail(error) {
    stop()
    const message = error?.message ?? String(error)
    let overlay = mount.querySelector("[data-engine-error]")
    if (!overlay) {
      overlay = document.createElement("div")
      overlay.dataset.engineError = ""
      overlay.style.cssText = `
        position: absolute; inset: 0; z-index: 999; display: grid;
        place-items: center; padding: 2rem; text-align: center;
        background: rgba(9, 9, 11, 0.88); color: #fca5a5;
        font: 500 0.8125rem/1.6 ui-monospace, SFMono-Regular, monospace;
        white-space: pre-wrap; overflow: auto;
      `
      mount.appendChild(overlay)
    }
    overlay.textContent = `The game hit an error and stopped.\n\n${message}`
  }

  /**
   * Uncaught errors outside the loop — a bad event handler, a rejected promise
   * — get the same treatment, for the same reason.
   */
  const onWindowError = (event) => fail(event.error ?? event.message)
  const onRejection = (event) => fail(event.reason)
  window.addEventListener("error", onWindowError)
  window.addEventListener("unhandledrejection", onRejection)

  /**
   * A lost WebGL context is not an error the game can act on, but a black
   * rectangle with no explanation is worse than a sentence saying so. The
   * default action would kill the page's chance of restoring, so it is
   * prevented and the loop simply waits.
   */
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault()
    paused = true
  })
  canvas.addEventListener("webglcontextrestored", () => {
    paused = false
  })

  /**
   * A hidden tab stops painting anyway; without this the first frame back
   * carries the entire hidden duration and the game lurches.
   *
   * The auto-pause is tracked separately from a pause the game asked for.
   * Resuming unconditionally would dismiss a pause menu the moment the player
   * switched tabs; not resuming at all leaves them staring at a frozen game
   * they never paused.
   */
  let autoPaused = false
  const onVisibility = () => {
    if (document.hidden) {
      if (!paused) {
        paused = true
        autoPaused = true
      }
    } else if (autoPaused) {
      engine.resume()
    }
  }
  document.addEventListener("visibilitychange", onVisibility)

  function start() {
    if (running) return engine
    running = true
    /**
     * `paused` is deliberately left alone. A title screen is usually put up
     * before the loop starts — `hud.panel()` pauses as it opens — and a
     * `start()` that cleared the flag would run the world behind the menu.
     */
    lastTime = performance.now()
    frameId = requestAnimationFrame(frame)
    return engine
  }

  function stop() {
    running = false
    if (frameId !== null) cancelAnimationFrame(frameId)
    frameId = null
  }

  const engine = {
    renderer,
    scene,
    camera,
    canvas,
    mount,
    size,
    dt: 0,
    elapsed: 0,

    /** Runs every frame with a clamped delta in seconds. Most logic goes here. */
    onUpdate(handler) {
      updateHandlers.add(handler)
      return () => updateHandlers.delete(handler)
    },
    /** Runs at a fixed rate. Use for physics, so behaviour is reproducible. */
    onFixedUpdate(handler) {
      fixedHandlers.add(handler)
      return () => fixedHandlers.delete(handler)
    },
    /** Runs after every update. Where cameras follow, so they see final positions. */
    onLateUpdate(handler) {
      lateHandlers.add(handler)
      return () => lateHandlers.delete(handler)
    },
    onResize(handler) {
      resizeHandlers.add(handler)
      handler(size)
      return () => resizeHandlers.delete(handler)
    },
    /** Registers cleanup to run on `dispose` — used by every helper here. */
    onDispose(handler) {
      disposers.add(handler)
      return () => disposers.delete(handler)
    },

    add: (...objects) => scene.add(...objects),
    remove: (...objects) => scene.remove(...objects),

    start,
    stop,
    pause: () => {
      paused = true
      autoPaused = false
    },
    resume: () => {
      /** The clock is reset so the paused span is not delivered as one delta. */
      lastTime = performance.now()
      accumulator = 0
      paused = false
      autoPaused = false
    },
    get paused() {
      return paused
    },
    get running() {
      return running
    },

    /**
     * Replaces `renderer.render` for the frame — how post-processing takes
     * over (see `fx.js`). Kept as a setter so a game never has to move its
     * render call into its own loop.
     */
    setRenderCallback(callback) {
      renderFrame = callback
      return engine
    },

    fail,

    /**
     * Frees everything the GPU is holding.
     *
     * Rarely needed inside a game, which lives as long as its page — but the
     * preview reloads on every turn, and a leak per reload is a leak per edit.
     */
    dispose() {
      stop()
      observer.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("error", onWindowError)
      window.removeEventListener("unhandledrejection", onRejection)
      for (const disposer of disposers) disposer()
      disposeObject(scene)
      renderer.dispose()
      canvas.remove()
    },
  }

  return engine
}

/**
 * Releases the GPU memory held by an object and everything under it.
 *
 * Removing a mesh from the scene unlinks it; it does not free the buffers its
 * geometry and textures uploaded. A game that spawns and removes projectiles
 * without this grows until the tab dies.
 */
export function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose()
    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose()
      }
      material.dispose()
    }
  })
  object.removeFromParent()
}
