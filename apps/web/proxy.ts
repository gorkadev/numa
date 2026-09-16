import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

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
export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) return NextResponse.next()

  const sessionCookie = getSessionCookie(request)

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
