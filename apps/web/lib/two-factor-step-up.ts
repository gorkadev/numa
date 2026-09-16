import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"

/**
 * `twoFactor` endpoints that must never be reachable over HTTP.
 *
 * `allowPasswordless` (see `lib/auth.ts`) replaces the plugin's password check
 * with nothing more than "has a session" — not even a fresh one for two of
 * these. A stolen session cookie could then:
 *
 * - `/two-factor/get-totp-uri`: read the TOTP secret itself, which is a
 *   permanent copy of the second factor. Nothing in this application needs
 *   it — `/two-factor/enable` already returns the URI once, at enrollment.
 * - `/two-factor/generate-backup-codes`: mint fresh recovery codes and read
 *   them, which is enough to pass the sign-in challenge later.
 * - `/two-factor/disable`: turn the second factor off.
 *
 * The last two stay available through `auth.api` for the server actions in
 * `lib/two-factor/actions.ts`, which verify a current TOTP code first — the
 * same "prove the second factor again" step-up GitHub calls sudo mode.
 */
const HTTP_BLOCKED_PATHS = new Set([
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
  "/two-factor/disable",
])

/**
 * Rejects HTTP requests to `HTTP_BLOCKED_PATHS` while leaving direct
 * `auth.api.*` calls from server code untouched. The two are told apart by
 * `ctx.request`: Better Auth's router sets it for every HTTP request, and an
 * `auth.api` call has none.
 */
export function twoFactorStepUp(): BetterAuthPlugin {
  return {
    id: "two-factor-step-up",
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path !== undefined && HTTP_BLOCKED_PATHS.has(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (!ctx.request) return

            throw APIError.from("FORBIDDEN", {
              message:
                "This action requires two-factor verification through the app.",
              code: "TWO_FACTOR_STEP_UP_REQUIRED",
            })
          }),
        },
      ],
    },
  }
}
