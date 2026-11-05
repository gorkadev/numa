import { TwoFactorChallenge } from "@/components/two-factor-challenge"

/**
 * The TOTP sign-in challenge. `lib/oauth-two-factor.ts`'s
 * `TWO_FACTOR_CHALLENGE_URL` points here, and `proxy.ts`'s `isPublicPath`
 * already lets every `/sign-in/*` path through with no session. A signed-in
 * visitor is sent to `/` by the proxy before this page renders, so the page
 * itself reads nothing per request and can be prerendered.
 *
 * This lives at the static segment `app/sign-in/two-factor/page.tsx`, next
 * to `app/sign-in/[[...sign-in]]/page.tsx`'s optional catch-all. Next's
 * router always resolves the more specific, static segment first.
 */
export default function TwoFactorChallengePage() {
  return <TwoFactorChallenge />
}
