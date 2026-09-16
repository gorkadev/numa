import type { BetterAuthPlugin } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import type { twoFactor } from "better-auth/plugins"

/**
 * Where a social sign-in lands when the user has TOTP enabled and still owes
 * a code. It sits under `/sign-in/` on purpose: `proxy.ts`'s `isPublicPath`
 * already lets it through, which it has to, because at that point the user
 * has no session cookie — only the plugin's short-lived `two_factor` cookie.
 */
export const TWO_FACTOR_CHALLENGE_URL = "/sign-in/two-factor"

const OAUTH_CALLBACK_PATH = "/callback/:id"

/**
 * Enforces the `twoFactor` plugin's sign-in challenge on GitHub and Google
 * sign-ins, which the plugin itself never does.
 *
 * # Why this exists
 *
 * The plugin challenges a sign-in from an `after` hook whose matcher is
 * hard-coded to `/sign-in/email`, `/sign-in/username` and
 * `/sign-in/phone-number` (`better-auth@1.7.5`,
 * `dist/plugins/two-factor/index.mjs`). The OAuth callback, `/callback/:id`, is
 * not on that list. This application signs in through OAuth only, so without
 * this plugin a user could enroll TOTP and never be asked for a code.
 *
 * # How
 *
 * It does not reimplement the challenge. It registers the plugin's OWN hook
 * handler a second time, matched to the OAuth callback instead, so trusted
 * devices, deleting the session, the `two_factor` cookie, and the attempt and
 * lockout records all stay the plugin's code. The session is only issued once
 * `/two-factor/verify-totp` (or `/two-factor/verify-backup-code`) succeeds
 * against that cookie — the exact path an email sign-in would take.
 *
 * The one thing the plugin's handler gets wrong for this route is the
 * response: it answers `{ twoFactorRedirect: true }` as JSON, which is what a
 * `fetch`-based credential sign-in expects but a browser navigation cannot
 * follow. The second hook turns that answer back into a redirect to
 * `TWO_FACTOR_CHALLENGE_URL`. When the plugin decides no challenge is needed
 * — 2FA off, or a valid trusted-device cookie — it returns nothing, the
 * callback's original redirect stands, and the second hook does nothing.
 *
 * Account linking goes through the same route, but it never creates a new
 * session, so the plugin's handler returns early and linking is unaffected.
 *
 * # Order
 *
 * Must come after `twoFactor` and before `nextCookies()` in `lib/auth.ts`'s
 * `plugins`.
 */
export function oauthTwoFactorChallenge(
  twoFactorPlugin: ReturnType<typeof twoFactor>
): BetterAuthPlugin {
  const challengeHook = twoFactorPlugin.hooks.after[0]

  // Reaching into the plugin's hook list is the price of not duplicating its
  // security logic. If an upgrade moves the credential challenge, fail at boot
  // rather than silently letting OAuth sign-ins through without a code.
  if (
    !challengeHook?.matcher({ path: "/sign-in/email" } as Parameters<
      typeof challengeHook.matcher
    >[0])
  ) {
    throw new Error(
      "oauthTwoFactorChallenge: the twoFactor plugin's sign-in challenge hook " +
        "was not found. Re-check it against the installed better-auth version."
    )
  }

  const isOAuthCallback = (ctx: { path?: string }) =>
    ctx.path === OAUTH_CALLBACK_PATH

  return {
    id: "oauth-two-factor-challenge",
    hooks: {
      after: [
        { matcher: isOAuthCallback, handler: challengeHook.handler },
        {
          matcher: isOAuthCallback,
          handler: createAuthMiddleware(async (ctx) => {
            if (!isTwoFactorRedirect(ctx.context.returned)) return

            throw ctx.redirect(TWO_FACTOR_CHALLENGE_URL)
          }),
        },
      ],
    },
  }
}

function isTwoFactorRedirect(returned: unknown): boolean {
  return (
    typeof returned === "object" &&
    returned !== null &&
    "twoFactorRedirect" in returned &&
    returned.twoFactorRedirect === true
  )
}
