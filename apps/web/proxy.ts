import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"
import createMiddleware from "next-intl/middleware"

import { routing } from "./i18n/routing"

const handleI18nRouting = createMiddleware(routing)

/**
 * Routes that must stay reachable without a session.
 *
 * - `/sign-in`, `/sign-up`: the pages that grant a session in the first
 *   place — redirecting them to themselves would be a loop.
 * - `/api/auth`: Better Auth's own route handler. OAuth callbacks from
 *   GitHub and Google arrive here as the very last unauthenticated request
 *   before a session exists, so gating this path is what breaks sign-in.
 * - `/api/webhook/polar`: Polar's own infrastructure posts here with no
 *   session, no cookie, and no other credential than the signature
 *   `app/api/webhook/polar/route.ts` verifies itself. Gating this path
 *   would make every payment event a redirect Polar records as a failed
 *   delivery and never retries the way it retries a 5xx.
 * - `/api/games/*\/preview/*`: the Daytona sandbox preview proxy. It is
 *   embedded in an `<iframe>` on an opaque origin, whose requests carry no
 *   cookies to check — `lib/games/queries.ts`'s `getGameForPreview` explains
 *   why this route proves authorization with a signed, short-lived token
 *   instead. Gating it here would 302 every preview frame to `/sign-in`.
 */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) return true
  if (pathname === "/sign-up" || pathname.startsWith("/sign-up/")) return true
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return true
  }
  if (
    pathname === "/api/webhook/polar" ||
    pathname.startsWith("/api/webhook/polar/")
  ) {
    return true
  }

  return /^\/api\/games\/[^/]+\/preview\//.test(pathname)
}

/**
 * An optimistic, cookie-presence-only redirect for signed-out visitors.
 *
 * This deliberately does not call `auth.api.getSession` — Better Auth's own
 * Next.js guidance is to keep the proxy to a cheap cookie check and let each
 * page or Server Action perform the real, database-backed check, which
 * `lib/session.ts`'s `requireSession` and `getSession` do. `getSessionCookie`
 * only proves a cookie shaped like a session exists, never that it is valid,
 * so this is a UX redirect — sending a signed-out browser to `/sign-in`
 * before it renders a page it cannot use — and never the actual
 * authorization boundary.
 *
 * Every route in this application used to be public in practice, because the
 * previous Clerk middleware called `clerkMiddleware()` with no
 * `auth.protect()` — see the note this replaces in
 * `app/api/webhook/polar/route.ts`. This proxy is what makes that no longer
 * true, so any future route that must stay reachable without a session has
 * to be added to `isPublicPath` above, the same way that file warned the next
 * person tightening this to do.
 */
function getPathnameWithoutLocale(pathname: string): string | null {
  const segments = pathname.split("/")
  const locale = segments[1]

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    return null
  }

  const unlocalizedPathname = `/${segments.slice(2).join("/")}`
  return unlocalizedPathname === "/" ? "/" : unlocalizedPathname.replace(/\/$/, "")
}

function isHandlerPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/trpc" ||
    pathname.startsWith("/trpc/") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/")
  )
}

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const localeFromRewrite = request.headers.get("x-next-intl-locale")
  const rewrittenPathname = getPathnameWithoutLocale(pathname)

  // next-intl's internal rewrite targets /[locale]/..., and Next can invoke
  // Proxy for that rewritten pathname as well. Treat its locale request header
  // as an internal routing marker so it is neither localized twice nor blocked
  // by the unprefixed public-page allowlist.
  if (
    rewrittenPathname !== null &&
    localeFromRewrite !== null &&
    routing.locales.includes(localeFromRewrite as (typeof routing.locales)[number])
  ) {
    if (isPublicPath(rewrittenPathname)) return NextResponse.next()

    if (!getSessionCookie(request)) {
      return NextResponse.redirect(new URL("/sign-in", request.url))
    }

    return NextResponse.next()
  }

  // Route handlers keep their existing URLs and response semantics. In
  // particular, never pass an API, webhook, preview, or checkout request to
  // next-intl, even though the matcher still runs the auth cookie check there.
  if (isHandlerPath(pathname)) {
    if (isPublicPath(pathname)) return NextResponse.next()

    if (!getSessionCookie(request)) {
      return NextResponse.redirect(new URL("/sign-in", request.url))
    }

    return NextResponse.next()
  }

  // Public auth pages still need locale negotiation and the internal rewrite
  // to app/[locale]. Only public handler paths bypass locale middleware above.
  const localeResponse = handleI18nRouting(request)

  if (isPublicPath(pathname)) return localeResponse

  // Cookie presence is only an optimistic UX check, never authorization. The
  // page and server-action session guards remain the security boundary.
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }

  return localeResponse
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
