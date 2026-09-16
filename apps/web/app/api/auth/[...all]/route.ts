import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@/lib/auth"

/**
 * Mounts every Better Auth endpoint — OAuth start and callback, session
 * lookup, sign-out, and so on — under this one catch-all route. This is the
 * path both `lib/auth-client.ts` (same-origin, no `baseURL` needed) and the
 * GitHub/Google OAuth apps' callback URLs are configured against; moving it
 * would mean updating both.
 */
export const { GET, POST } = toNextJsHandler(auth)
