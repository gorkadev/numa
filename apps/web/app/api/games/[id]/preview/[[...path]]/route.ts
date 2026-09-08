import { GAME_PORT, startGameServer } from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"

/**
 * Headers that describe the *hop*, not the payload. `content-encoding` and
 * `content-length` describe a body that `fetch` has already decoded for us, so
 * replaying them would make the browser try to gunzip plain bytes.
 */
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
])

/**
 * Proxies the game's preview through this origin.
 *
 * The sandbox's own preview URL is not something the browser can be handed
 * directly: it needs a per-sandbox token that is reissued on every restart, and
 * an unauthenticated visitor to that URL would bypass the org check entirely.
 * Routing it through here keeps the token server-side and makes the preview
 * inherit the game's own authorization — `getGame` is org-scoped, so a game
 * belonging to another organization 404s exactly as its page does.
 *
 * Same-origin also matters for the iframe: cookies, `postMessage` and devtools
 * all behave as if the game were part of the app.
 */
async function proxy(
  request: Request,
  ctx: { params: Promise<{ id: string; path?: string[] }> }
): Promise<Response> {
  const { id, path } = await ctx.params

  const game = await getGame(id)

  if (!game) return new Response("Not found", { status: 404 })

  /**
   * A null `sandboxId` means the game was never provisioned — the chat has not
   * had its first turn yet. That is an expected state, not a failure, so it is
   * a 404 the preview pane can render as "nothing to show".
   */
  if (!game.sandboxId) {
    return new Response("Game has no sandbox", { status: 404 })
  }

  const { sandbox } = await startGameServer(game.sandboxId)

  /**
   * The standard preview link, not a signed one: the token is sent as a header
   * from here and never reaches the browser, and it is reissued on every
   * sandbox restart — which is exactly why it is minted per request rather than
   * stored on the game row.
   */
  const { url, token } = await sandbox.getPreviewLink(GAME_PORT)

  /**
   * The catch-all is undefined at the proxy root, which is the index request.
   * Segments arrive decoded, so they are re-encoded rather than joined raw.
   */
  const target = new URL(
    (path ?? []).map(encodeURIComponent).join("/"),
    `${url.replace(/\/$/, "")}/`
  )
  target.search = new URL(request.url).search

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      "x-daytona-preview-token": token,
      /**
       * Without this the proxy answers a first browser visit with an interstitial
       * warning page instead of the game.
       */
      "x-daytona-skip-preview-warning": "true",
      accept: request.headers.get("accept") ?? "*/*",
    },
    /**
     * The preview is a moving target: the agent rewrites the game's files
     * between turns, so a cached response is a stale game.
     */
    cache: "no-store",
    redirect: "manual",
  })

  const headers = new Headers()

  for (const [key, value] of upstream.headers) {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  }

  headers.set("cache-control", "no-store")

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

export const GET = proxy
export const HEAD = proxy
