import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { dash } from "@better-auth/infra"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { lastLoginMethod, multiSession, twoFactor } from "better-auth/plugins"
import { getAuthenticatorName, passkey } from "@better-auth/passkey"
import { db, schema } from "@workspace/db"

import { oauthTwoFactorChallenge } from "@/lib/oauth-two-factor"
import { twoFactorStepUp } from "@/lib/two-factor-step-up"

/**
 * TOTP only: no `otpOptions.sendOTP`, so `/two-factor/enable` rejects
 * `method: "otp"` and the sign-in challenge only offers the authenticator app
 * and backup codes.
 *
 * `allowPasswordless` is what makes the plugin usable here at all. By default
 * enabling, disabling and regenerating backup codes all require the user's
 * password, and no account in this application has one. With it on, the plugin
 * falls back to requiring a fresh session instead — and would still demand a
 * password from any user who does have a credential account. That fallback is
 * too weak for reading the secret, regenerating backup codes or disabling 2FA,
 * so `twoFactorStepUp()` closes those endpoints over HTTP and
 * `lib/two-factor/actions.ts` gates them behind a fresh TOTP code instead.
 */
const twoFactorPlugin = twoFactor({
  issuer: "numa",
  allowPasswordless: true,
})

/**
 * # Why a passkey sign-in is NOT also asked for a TOTP code
 *
 * The plugin's own challenge hook matches `/sign-in/email|username|
 * phone-number`, and `lib/oauth-two-factor.ts` adds `/callback/:id` to that
 * list — `/passkey/verify-authentication` is on neither, so a passkey sign-in
 * reaches the application without a second step. That is deliberate, not an
 * oversight.
 *
 * A passkey with user verification IS multi-factor on its own: the private
 * key never leaves the authenticator (possession) and the ceremony only
 * completes once the device is unlocked by biometric or PIN (inherence or
 * knowledge). NIST SP 800-63B counts exactly this — a multi-factor
 * cryptographic device — as sufficient for AAL2 without anything stacked on
 * top, and the requirement below (`userVerification: "required"`, enforced in
 * `authentication.afterVerification`) is what makes the claim true here
 * rather than aspirational.
 *
 * Adding TOTP afterwards would also make the flow WORSE, not safer. A passkey
 * is bound to this origin and cannot be replayed against a lookalike domain;
 * a TOTP code can be read aloud, typed into a phishing page, or phoned out of
 * someone. Ending the strongest flow in the application with "now type a
 * six-digit code" trains the one habit that defeats it. The second factor
 * stays where it is needed: OAuth, where the first factor is a password held
 * at Google or GitHub.
 */

/**
 * WebAuthn passkeys, as a second way in alongside the OAuth providers.
 *
 * `rpID` and `origin` are left unset on purpose. The plugin derives the
 * relying-party id from `baseURL` when that is a string, and falls back to
 * `"localhost"` otherwise — and `resolveBaseURL()` below returns an OBJECT in
 * development, so development gets `localhost` and production gets the
 * deployed hostname without either being spelled out twice. The consequence
 * worth knowing: a passkey cannot be registered from the LAN address a phone
 * uses, because that origin is neither `localhost` nor served over HTTPS, and
 * WebAuthn requires a secure context. That is a property of the standard, not
 * something configuration here can grant.
 *
 * `afterVerification` names a passkey after the authenticator that created it
 * ("iCloud Keychain", "1Password", …) when the user did not name it. A
 * client-supplied name still wins; Apple's default flow reports an all-zero
 * AAGUID, so this legitimately resolves to nothing fairly often and the UI
 * falls back to a generic label.
 */
const passkeyPlugin = passkey({
  rpName: "Numa",
  /**
   * `userVerification: "required"` upgrades the ceremony from "prove you hold
   * this device" to "prove you hold this device AND unlock it" — Touch ID, a
   * Windows Hello face, a security-key PIN. That is what makes a passkey two
   * factors on its own rather than one, and it is the entire reason this
   * application does NOT also demand a TOTP code after a passkey sign-in (see
   * the note on `twoFactorPlugin` above).
   *
   * `residentKey: "required"` makes it a discoverable credential, which is
   * what lets the sign-in page offer "Continue with a passkey" with no email
   * field: the authenticator itself knows which accounts it holds for this
   * site. Without it there is nothing for a userless sign-in to look up.
   */
  authenticatorSelection: {
    residentKey: "required",
    userVerification: "required",
  },
  registration: {
    afterVerification: async ({ verification }) => ({
      name: getAuthenticatorName(verification.registrationInfo?.aaguid),
    }),
  },
  authentication: {
    /**
     * The plugin asks SimpleWebAuthn to verify with
     * `requireUserVerification: false` — hardcoded, in both the registration
     * and the authentication path (see `dist/index.mjs`) — so the `required`
     * above is only ever a REQUEST to the browser. A client that ignores it
     * and returns an assertion with the UV flag clear would still be accepted,
     * and the passkey would silently drop to a single possession factor.
     *
     * This hook is where that gap closes: it runs after the signature is
     * verified and before the session is created, so throwing here refuses
     * the sign-in outright. `userVerified` is the parsed UV bit of the
     * authenticator data, straight from the verification result.
     */
    afterVerification: async ({ verification }) => {
      if (!verification.authenticationInfo.userVerified) {
        throw new APIError("UNAUTHORIZED", {
          message:
            "Unlock your device with a biometric or PIN to sign in with this passkey.",
        })
      }
    },
  },
})

/**
 * Multiple accounts signed in at once in the same browser, switched from the
 * sidebar's account menu.
 *
 * Each sign-in adds its own cookie beside the active session's, and
 * `/multi-session/set-active` swaps which one is active; a plain `signOut`
 * still ends all of them, which is the behaviour someone pressing "Sign out"
 * expects. The default cap of five per device is left alone — it exists to
 * stop cookie growth, and nothing here needs more.
 */
const multiSessionPlugin = multiSession()

/**
 * Remembers which provider last worked, so the sign-in page can point at it.
 *
 * Cookie only: `storeInDatabase` would add a `lastLoginMethod` column to
 * `user` for a hint that is read exactly once, on a page nobody is signed in
 * on yet — the cookie is already the right lifetime and the right scope for
 * that, and a database column would outlive the usefulness of the answer.
 */
const lastLoginMethodPlugin = lastLoginMethod({
  /**
   * The plugin's built-in resolution knows about `/callback/:id` and the
   * email endpoints only, so a passkey sign-in would otherwise leave the hint
   * pointing at whichever provider was used before it — actively misleading
   * on the one page where the hint is the whole point. Returning `null` for
   * every other path keeps the default behaviour for the OAuth callbacks.
   */
  customResolveMethod: (ctx) =>
    ctx.path === "/passkey/verify-authentication" ? "passkey" : null,
})

/**
 * The server-side Better Auth instance. Everything in this application that
 * needs to know who is signed in — the route handler below, `lib/session.ts`,
 * `proxy.ts`'s optimistic cookie check — ultimately goes through this object.
 *
 * # Why the Drizzle adapter
 *
 * `better-auth/adapters/drizzle` is a re-export of the separate
 * `@better-auth/drizzle-adapter` package, which `better-auth` already depends
 * on — importing through the subpath keeps the adapter's version locked to
 * `better-auth`'s own instead of declaring a second dependency that can drift.
 * `packages/db/src/schema.ts`'s `user`/`session`/`account`/`verification`
 * tables were checked against `@better-auth/cli generate`'s output for this
 * version.
 *
 * `db` is the same Drizzle instance every other query in this application
 * uses — see `packages/db/src/client.ts` — so auth reads and writes and every
 * other query share one connection pool rather than opening a second one.
 *
 * # Why no organization plugin
 *
 * This application has no organization concept: the individual user IS the
 * tenant everywhere a Clerk organization used to be — `games.userId`,
 * `turnUsage.userId`, and the Polar customer identity in `lib/polar/
 * customers.ts` all key on `user.id` directly. Adding the plugin back would
 * reintroduce the exact concept this migration removes.
 *
 * # Why social-only, and why `nextCookies()` is last
 *
 * Sign-in is GitHub and Google only — there is no email provider configured
 * for this project, so `emailAndPassword` stays disabled rather than half-
 * wired. `nextCookies()` has to be the LAST plugin in the array: it patches
 * every action that sets a cookie (sign-in, sign-out, session refresh) to
 * route through Next's `cookies()` helper instead of a raw `Set-Cookie`
 * header, which is what makes those actions work when called from a Server
 * Action rather than a route handler.
 *
 * # Why `onAPIError.errorURL` is `/sign-in`
 *
 * Without it, every failed OAuth round trip — a user pressing Cancel on the
 * provider's consent screen included — lands on Better Auth's development
 * error page at `/api/auth/error`. `/sign-in` reads the `?error=<code>` Better
 * Auth appends and shows it above the buttons, so the user can retry in
 * place. `auth-page.tsx` also passes the same URL as each flow's
 * `errorCallbackURL`; this global one still matters because a
 * `state_mismatch` (expired or tampered state cookie) cannot read that
 * per-flow value back out of the state, and falls back to this one.
 *
 * # Why `advanced.database.joins`
 *
 * Every `getSession` otherwise costs two round trips to Neon — the session
 * row, then its user. With joins on, the adapter fetches both in one
 * relational query; measured against this database, p50 dropped from ~90ms
 * to ~45ms. It depends on the Drizzle relations at the end of
 * `packages/db/src/schema.ts`: without them the join throws instead of
 * falling back, so the two have to change together.
 */
/**
 * LAN hosts a phone on the same network reaches the dev server through, with
 * the port — Better Auth compares the request's `Host` header exactly, so
 * `192.168.1.234` alone would not match `192.168.1.234:3000`. Keep this in
 * step with `allowedDevOrigins` in `next.config.ts`, which gates the same
 * hosts on Next's side.
 */
const DEV_LAN_HOSTS = ["192.168.1.234:3000"]

/**
 * `BETTER_AUTH_URL` as a fixed string everywhere but local development.
 *
 * In development the base URL is resolved per request from an allowlist
 * instead, so the app also works when opened from a phone on the LAN: a
 * fixed `localhost` base would reject the phone's origin and would send every
 * OAuth callback to `localhost` — which, on the phone, is the phone. Each
 * allowed host is also added to the trusted origins, so no separate
 * `trustedOrigins` entry is needed.
 *
 * The OAuth providers still have to accept the LAN callback URL
 * (`http://<host>/api/auth/callback/<provider>`); that is provider
 * configuration, not something this file can grant.
 */
function resolveBaseURL() {
  const configured = process.env.BETTER_AUTH_URL

  if (process.env.NODE_ENV !== "development" || !configured) return configured

  return {
    allowedHosts: [new URL(configured).host, ...DEV_LAN_HOSTS],
    protocol: "http" as const,
    fallback: configured,
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseURL(),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  onAPIError: {
    errorURL: "/sign-in",
  },
  advanced: {
    database: {
      joins: true,
    },
  },
  plugins: [
    twoFactorPlugin,
    oauthTwoFactorChallenge(twoFactorPlugin),
    twoFactorStepUp(),
    passkeyPlugin,
    multiSessionPlugin,
    lastLoginMethodPlugin,
    nextCookies(),
    dash(),
  ],
  appName: "numa",
})

/**
 * The shape `auth.api.getSession` resolves to: `null` when there is no
 * session, or `{ session, user }` when there is. Exported so callers outside
 * `lib/session.ts` can type a value they received rather than re-deriving it.
 */
export type Session = Awaited<ReturnType<typeof auth.api.getSession>>
