import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { auth, type Session } from "@/lib/auth"

/**
 * The current session, or `null` if the caller is not signed in.
 *
 * This is the direct replacement for Clerk's `auth()`: it never redirects and
 * never throws, so it is the right call wherever a missing session is a
 * benign state rather than an error — `lib/polar/plan.ts`'s
 * `getBillingSummary`, for instance, which answers "nothing is known" for a
 * signed-out caller instead of refusing the page.
 *
 * `auth.api.getSession` needs the incoming request's headers to read the
 * session cookie, which is why this — like every function in this file — can
 * only run on the server.
 *
 * Memoized per request with React's `cache()`: a single render asks for the
 * session from the layout, the billing helpers and the game queries, and each
 * ask would otherwise be its own lookup. The memo dies with the request, so a
 * later request always re-reads the cookie.
 */
export const getSession = cache(
  async (): Promise<Session> =>
    auth.api.getSession({ headers: await headers() })
)

/**
 * The current session, or a redirect to `/sign-in` if there is none.
 *
 * This is the direct replacement for Clerk's `auth.protect()`. Unlike the
 * Clerk version there is no "signed in but no active organization" state to
 * handle afterwards: this application has no organization concept, so a
 * session is either present — in which case `session.user.id` is always the
 * caller's tenant boundary — or absent, in which case the caller never
 * returns because `redirect` throws.
 */
export async function requireSession(): Promise<NonNullable<Session>> {
  const session = await getSession()

  if (!session) redirect("/sign-in")

  return session
}
