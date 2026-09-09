import { GAME_PORT, startGameServer } from "@/lib/daytona/utils"
import { verifyPreviewToken } from "@/lib/games/preview-token"
import { getGameForPreview } from "@/lib/games/queries"

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
 * Routing it through here keeps that token server-side.
 *
 * Authorization is the signed token in the path, not the session cookie. The
 * frame is sandboxed onto an opaque origin, and a null origin never satisfies a
 * module script's `same-origin` credentials mode — so subresource requests
 * arrive here with no cookies whatever the session looks like. Reaching for the
 * session would redirect them to `/sign-in` instead, which the frame reports as
 * a CORS failure. See `lib/games/preview-token` for why the token sits in a
 * path segment.
 */
async function proxy(
  request: Request,
  ctx: { params: Promise<{ id: string; token: string; path?: string[] }> }
): Promise<Response> {
  const { id, token: previewToken, path } = await ctx.params

  /**
   * A bad or expired token answers 404 rather than 403, for the same reason
   * `getGame` folds the org boundary into the lookup: a distinct status would
   * confirm which game ids exist to a caller holding no valid token for any.
   */
  if (!verifyPreviewToken(previewToken, id)) {
    return new Response("Not found", { status: 404 })
  }

  const game = await getGameForPreview(id)

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
   *
   * Only `path` goes upstream. The preview token is this route's authorization
   * and means nothing to the sandbox, which serves the game's files from its own
   * root — forwarding it would ask for a directory that does not exist.
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

  /**
   * The preview frame is sandboxed without `allow-same-origin`, so it runs on an
   * opaque origin and every request it makes here is cross-origin. Classic
   * scripts and images would not care, but ES modules — the game entry point and
   * every bare specifier its import map resolves — are always fetched in CORS
   * mode, so without this they fail before executing a line.
   *
   * `*` is safe precisely because it forbids credentials: a real cross-origin
   * page still cannot read an authenticated preview, while the null-origin frame
   * (which sends no credentials of its own) can.
   */
  headers.set("access-control-allow-origin", "*")

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

export const GET = proxy
export const HEAD = proxy
