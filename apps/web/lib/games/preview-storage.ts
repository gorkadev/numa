/**
 * Web Storage for a frame that is not allowed to have any.
 *
 * The preview iframe is sandboxed WITHOUT `allow-same-origin` — see
 * `components/chat-preview.tsx` for why that flag can never be granted while
 * the proxy serves the game from this application's own origin. The
 * consequence is not that storage is empty, it is that storage is a trap:
 * `window.localStorage` on an opaque origin THROWS a `SecurityError` the
 * moment it is read. A game that touches it at module scope dies before it
 * draws a frame, and the player sees a blank pane with an error only the
 * devtools console records.
 *
 * That is exactly what happened. So every game page served through the proxy
 * gets a replacement installed before its own scripts run.
 *
 * # Why a shim and not a fix
 *
 * The real fix is a second origin: serve the preview from `preview.<domain>`
 * and `allow-same-origin` becomes safe, because "same origin" then means the
 * preview's origin rather than the one holding the session cookies. Storage is
 * genuine and survives reloads. That is a deployment change and a token
 * change, and it is the right thing to build the day persisted progress is a
 * product promise.
 *
 * Until then this keeps games running. What it buys is that `localStorage`
 * exists and behaves; what it does not buy is persistence — the map dies with
 * the frame, so a reload is a new save file. That is a worse game, and it is
 * enormously better than a game that does not start.
 *
 * # Why it is defined rather than assigned
 *
 * `localStorage` is an accessor on `Window.prototype`, so `window.localStorage
 * = x` in strict mode fails and in sloppy mode silently does nothing — the
 * prototype getter still wins and still throws. `Object.defineProperty` puts
 * an OWN property on the window, which shadows the prototype's accessor
 * entirely. Nothing downstream can tell the difference.
 *
 * The probe is a read inside `try`, because a read is the thing that throws.
 * A browser where storage genuinely works is left alone, which matters for
 * whoever opens a preview URL directly in a tab while debugging.
 */
const STORAGE_SHIM = `<script>
(function () {
  function memoryStorage() {
    var entries = new Map()
    return {
      get length() { return entries.size },
      key: function (index) {
        return Array.from(entries.keys())[index] || null
      },
      getItem: function (key) {
        var value = entries.get(String(key))
        return value === undefined ? null : value
      },
      setItem: function (key, value) { entries.set(String(key), String(value)) },
      removeItem: function (key) { entries.delete(String(key)) },
      clear: function () { entries.clear() }
    }
  }

  ;["localStorage", "sessionStorage"].forEach(function (name) {
    try {
      window[name].getItem
    } catch (error) {
      Object.defineProperty(window, name, {
        value: memoryStorage(),
        configurable: true
      })
    }
  })
})()
</script>`

/**
 * Puts the shim in front of the game's own scripts.
 *
 * Immediately after the opening `<head>` rather than appended anywhere later,
 * because "before the game's first script" is the entire requirement: the
 * failing access is usually at module scope in the game's entry point, and a
 * shim installed after it has already thrown is decoration.
 *
 * A page with no `<head>` at all is legal — the parser invents one — so the
 * fallback prepends. That produces the same result for the same reason: the
 * script is still the first thing the parser executes.
 */
export function injectPreviewStorageShim(html: string): string {
  const head = /<head[^>]*>/i.exec(html)

  if (!head) return `${STORAGE_SHIM}${html}`

  const at = head.index + head[0].length

  return `${html.slice(0, at)}${STORAGE_SHIM}${html.slice(at)}`
}
