import { redirect } from "next/navigation"

import { TwoFactorChallenge } from "@/components/two-factor-challenge"
import { getSession } from "@/lib/session"

/**
 * The TOTP sign-in challenge. `lib/oauth-two-factor.ts`'s
 * `TWO_FACTOR_CHALLENGE_URL` points here, and `proxy.ts`'s `isPublicPath`
 * already lets every `/sign-in/*` path through with no session — a visitor
 * reaches this page carrying only the plugin's short-lived `two_factor`
 * cookie, never a real session, so `getSession()` normally answers `null`
 * here.
 *
 * The `getSession()` check is still worth doing: it is what sends someone
 * who already completed the challenge (or who never needed it) away from a
 * page with nothing left for them to do here, the same way `/sign-in`
 * itself would if Better Auth ever supported checking that.
 *
 * This lives at the static segment `app/sign-in/two-factor/page.tsx`, next
 * to `app/sign-in/[[...sign-in]]/page.tsx`'s optional catch-all. Next's
 * router always resolves the more specific, static segment first — the
 * catch-all only ever matches paths with no dedicated route of their own —
 * so `/sign-in/two-factor` renders this file, not the catch-all.
 */
export default async function TwoFactorChallengePage() {
  const session = await getSession()

  if (session) redirect("/")

  return <TwoFactorChallenge />
}
