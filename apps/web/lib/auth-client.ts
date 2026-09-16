import { createAuthClient } from "better-auth/react"
import {
  lastLoginMethodClient,
  multiSessionClient,
  twoFactorClient,
} from "better-auth/client/plugins"
import { passkeyClient } from "@better-auth/passkey/client"

/**
 * The browser-side counterpart to `lib/auth.ts`. `createAuthClient` needs no
 * `baseURL` here: the client defaults to same-origin requests against
 * `/api/auth/*`, which is where `app/api/auth/[...all]/route.ts` mounts the
 * handler, so nothing has to be duplicated between the two files.
 *
 * `nav-user.tsx` reads `authClient.useSession()` for the signed-in user's
 * name, email and avatar, and the sign-in pages call
 * `authClient.signIn.social({ provider, callbackURL })` to start GitHub or
 * Google OAuth.
 *
 * `twoFactorClient()` adds `authClient.twoFactor.*` — enable, verifyTotp,
 * verifyBackupCode, disable. No `onTwoFactorRedirect`: that callback only
 * fires for `fetch`-based credential sign-ins, and every sign-in here is an
 * OAuth redirect that `lib/oauth-two-factor.ts` routes to the challenge page
 * on the server.
 *
 * `passkeyClient()` adds `authClient.passkey.*` (addPasskey,
 * listUserPasskeys, deletePasskey, updatePasskey) and `signIn.passkey`. It
 * has to live on the client rather than only on the server because the
 * WebAuthn ceremony itself runs in the browser: the plugin calls
 * `navigator.credentials.create()` / `.get()` with the options the server
 * issued, and posts the authenticator's response back.
 *
 * `multiSessionClient()` adds `authClient.multiSession.*` — the device's
 * other signed-in accounts, plus `setActive` to switch between them — which
 * `components/nav-user.tsx` renders as the account switcher.
 *
 * `lastLoginMethodClient()` adds `getLastUsedLoginMethod()`. It reads a
 * plain cookie the server set (`httpOnly: false` by design), so it answers
 * synchronously, with no request, on a page where nobody is signed in yet.
 */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient(),
    passkeyClient(),
    multiSessionClient(),
    lastLoginMethodClient(),
  ],
})
