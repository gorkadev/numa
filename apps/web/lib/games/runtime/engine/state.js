/**
 * What the game is doing right now, and what it remembers.
 *
 * Games grow a scattering of booleans — `started`, `dead`, `paused`,
 * `showingMenu` — and then grow the bugs that come from two of them being true
 * at once. A single phase with explicit transitions cannot contradict itself,
 * and it gives the HUD one thing to listen to.
 *
 * `localStorage` is the only persistence available: there is no server behind
 * the game. In the preview it is a memory-backed stand-in installed by the
 * proxy — the frame is sandboxed onto an opaque origin, where the real one
 * throws on access — so saves last as long as the frame does. Every read here
 * stays defensive regardless: a high score that throws on load is a game that
 * will not start.
 */

/** The phases nearly every game has. A game may add its own. */
export const PHASES = {
  MENU: "menu",
  PLAYING: "playing",
  PAUSED: "paused",
  OVER: "over",
  WON: "won",
}

/**
 * @param {object} engine
 * @param {object} [options]
 * @param {object} [options.values] Starting counters — score, lives, level.
 * @param {string} [options.saveKey] Namespace for persisted values. Omit and
 *   nothing is written.
 * @param {string[]} [options.persist] Which values survive a reload, and are
 *   tracked as bests.
 */
export function createGameState(engine, options = {}) {
  const {
    values = { score: 0, lives: 3 },
    phase: initialPhase = PHASES.MENU,
    saveKey = null,
    persist = ["score"],
  } = options

  const initial = { ...values }
  const current = { ...values }
  const phaseHandlers = new Map()
  const valueHandlers = new Map()
  let phase = initialPhase

  /**
   * Reads survive a browser that refuses storage entirely — private windows,
   * blocked cookies, an embedded frame with restrictive settings. The game
   * loses its high score, which is a far better outcome than not loading.
   */
  function readStore() {
    if (!saveKey) return {}
    try {
      return JSON.parse(localStorage.getItem(saveKey) ?? "{}")
    } catch {
      return {}
    }
  }

  function writeStore(data) {
    if (!saveKey) return
    try {
      localStorage.setItem(saveKey, JSON.stringify(data))
    } catch {
      /* Storage is full or forbidden. Nothing here is worth failing over. */
    }
  }

  const stored = readStore()
  const best = { ...stored.best }

  function emit(map, key, ...args) {
    const handlers = map.get(key)
    if (handlers) for (const handler of handlers) handler(...args)
  }

  function subscribe(map, key, handler) {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(handler)
    return () => map.get(key).delete(handler)
  }

  const state = {
    get phase() {
      return phase
    },
    get values() {
      return current
    },
    get best() {
      return best
    },

    /** True only in the phase where input should reach the game. */
    get isPlaying() {
      return phase === PHASES.PLAYING
    },

    /**
     * Moves to a phase and tells everyone listening.
     *
     * Re-entering the same phase is a no-op rather than a re-fire: a handler
     * that spawns a wave should not spawn two because something set `playing`
     * twice.
     */
    to(next, detail = null) {
      if (next === phase) return state
      const previous = phase
      phase = next

      /** The engine follows the phase, so pause menus need no extra wiring. */
      if (next === PHASES.PLAYING) engine.resume()
      else if (next === PHASES.PAUSED) engine.pause()

      emit(phaseHandlers, next, detail, previous)
      emit(phaseHandlers, "*", next, previous)
      return state
    },

    /** Runs `handler` on entering `phase`. Pass "*" for every transition. */
    on(phaseName, handler) {
      return subscribe(phaseHandlers, phaseName, handler)
    },

    get(key) {
      return current[key]
    },

    /**
     * Writes a value and notifies its watchers, so the HUD updates without the
     * game loop remembering to push to it.
     */
    set(key, value) {
      current[key] = value
      if (persist.includes(key) && (best[key] === undefined || value > best[key])) {
        best[key] = value
        writeStore({ ...readStore(), best })
      }
      emit(valueHandlers, key, value)
      return value
    },

    add(key, amount = 1) {
      return state.set(key, (current[key] ?? 0) + amount)
    },

    /** Runs `handler` whenever the value changes, and once immediately. */
    watch(key, handler) {
      const unsubscribe = subscribe(valueHandlers, key, handler)
      handler(current[key])
      return unsubscribe
    },

    /**
     * Back to the starting values, without touching the bests.
     *
     * Every game needs this and every game forgets it: a "play again" that
     * leaves the score where it was is the most common bug in a jam game.
     */
    reset() {
      for (const [key, value] of Object.entries(initial)) state.set(key, value)
      return state
    },

    /** Persists arbitrary progress — unlocks, settings, a level number. */
    save(data) {
      writeStore({ ...readStore(), ...data })
    },
    load() {
      return readStore()
    },
  }

  return state
}
