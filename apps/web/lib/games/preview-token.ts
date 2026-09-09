import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Authorization for the preview proxy, carried in the URL instead of a cookie.
 *
 * The preview frame is sandboxed without `allow-same-origin`, so it runs on an
 * opaque origin. ES module scripts are always fetched in CORS mode with a
 * credentials mode of `same-origin`, and against a null origin that resolves to
 * "not same origin" — the browser sends no cookies at all. So the game's
 * `index.html` loads (a navigation carries cookies) while its
 * `<script type="module" src="./game.js">` arrives at the proxy anonymous, gets
 * redirected to the sign-in page, and surfaces in the console as a CORS error.
 * Cookie-based authorization cannot work for a subresource of a null-origin
 * frame, no matter how the session is configured.
 *
 * A signed token fixes that because it travels in the request line rather than
 * in credentials. It lives in a *path segment* rather than a query string
 * precisely so the game does not have to know about it: relative resolution
 * keeps the whole directory prefix, so `./game.js` inside a document served
 * from `/api/games/<id>/preview/<token>/index.html` resolves back through the
 * same token. A query string would be dropped by that resolution and every
 * subresource would be unauthorized again.
 */

/**
 * Twelve hours. The token is minted once, when the game page renders, and the
 * frame keeps using it for as long as that tab lives — a chat session plus the
 * preview reloads each turn triggers can easily outlast a window measured in
 * minutes. A short expiry would turn a working preview into a 403 mid-session,
 * which reads as the app breaking rather than as a security boundary; hours are
 * long enough to cover a sitting while still bounding how long a URL that
 * leaked out of someone's history stays useful.
 */
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000

/**
 * The secret is read per call rather than at module load so that importing this
 * file — which a Next build does while collecting page data — cannot fail on a
 * machine that has not set the variable yet.
 *
 * There is deliberately no fallback value. A default secret would still produce
 * tokens that verify, so the proxy would look authorized while accepting a
 * token anyone could forge from public source; failing loudly is the only safe
 * behaviour.
 */
function readSecret(): string {
  const secret = process.env.PREVIEW_TOKEN_SECRET

  if (!secret) {
    throw new Error(
      "PREVIEW_TOKEN_SECRET is not set. The game preview proxy cannot sign or verify preview tokens without it."
    )
  }

  return secret
}

/**
 * base64url, so the digest survives being a single URL path segment: the
 * standard alphabet's `+` and `=` need escaping and its `/` would split the
 * segment in two, which would break both routing and the relative resolution
 * the token depends on.
 */
function sign(gameId: string, expiresAt: number): string {
  return createHmac("sha256", readSecret())
    .update(`${gameId}.${expiresAt}`)
    .digest("base64url")
}

/**
 * Mints a token that authorizes reads of one game's preview.
 *
 * Call this on the server only — the secret must never be shipped to the
 * browser, which only ever needs the resulting opaque string.
 */
export function signPreviewToken(gameId: string): string {
  const expiresAt = Date.now() + TOKEN_LIFETIME_MS

  return `${expiresAt}.${sign(gameId, expiresAt)}`
}

/**
 * Whether `token` is one this server issued for `gameId` and has not expired.
 *
 * The token arrives as a URL segment typed by anyone, so every step treats it
 * as hostile input and answers `false` rather than throwing: a malformed token
 * is an unauthorized request, not a 500.
 *
 * The game id is part of the signed payload rather than checked alongside it,
 * so a token minted for one game cannot be replayed against another by
 * swapping the id in the path.
 */
export function verifyPreviewToken(token: string, gameId: string): boolean {
  const separator = token.indexOf(".")

  if (separator === -1) return false

  const expiresAt = Number(token.slice(0, separator))
  const digest = token.slice(separator + 1)

  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false

  /**
   * A missing secret is deliberately left to throw. It is a deployment fault,
   * not hostile input, and answering `false` would quietly turn every preview
   * into a 404 that looks like a routing bug.
   */
  const expected = sign(gameId, expiresAt)

  const received = Buffer.from(digest)
  const reference = Buffer.from(expected)

  /**
   * `timingSafeEqual` throws on buffers of different lengths, so the length is
   * compared first. Leaking that one fact is harmless — the digest length is
   * fixed by SHA-256 and public.
   */
  if (received.length !== reference.length) return false

  return timingSafeEqual(received, reference)
}
