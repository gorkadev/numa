"use server"

import { headers } from "next/headers"
import { APIError } from "better-auth/api"

import { auth } from "@/lib/auth"
import { requireSession } from "@/lib/session"

const CODE_PATTERN = /^\d{6}$/

/**
 * Turns a raw `APIError` from `auth.api.*` into copy safe to show a user.
 *
 * The two-factor endpoints throw structured errors — see
 * `better-auth/dist/plugins/two-factor/error-code.mjs` for the exhaustive
 * list — and the message on most of them is already user-facing. What is
 * NOT safe to forward is an error this function does not recognize: it could
 * carry internal detail (a stack trace, a database message) that has no
 * business reaching the browser, so anything unmapped falls back to a
 * generic line instead of `error.message`.
 */
function describeTwoFactorError(error: unknown): string {
  if (error instanceof APIError) {
    const code = error.body?.code

    switch (code) {
      case "INVALID_CODE":
        return "That code didn't work. Check your authenticator app and try again."
      case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
        return "Too many attempts. Wait a moment and try again."
      case "ACCOUNT_TEMPORARILY_LOCKED":
        return "Too many failed attempts. Try again in 15 minutes."
      case "TWO_FACTOR_NOT_ENABLED":
        return "Two-factor authentication isn't enabled on your account."
      default:
        return "Something went wrong. Try again."
    }
  }

  return "Something went wrong. Try again."
}

export type TwoFactorStepUpState = { error: string } | { backupCodes: string[] }

/**
 * Regenerates a user's recovery codes, invalidating every code issued
 * before it.
 *
 * # Why this asks for a TOTP code first
 *
 * `lib/auth.ts`'s `twoFactorPlugin` runs with `allowPasswordless: true`
 * because no account in this application has a password. Without that
 * option, Better Auth would require the user's password before minting new
 * codes; with it, the plugin falls back to accepting any signed-in session.
 * That fallback is too weak here — a stolen session cookie would be enough
 * to read a fresh set of recovery codes and pass the sign-in challenge
 * later. Verifying a live TOTP code first is this application's
 * replacement step-up: proof the caller still holds the authenticator app,
 * not just the cookie. See `lib/two-factor-step-up.ts` for the matching
 * HTTP-layer block on calling `/two-factor/generate-backup-codes` directly.
 *
 * `auth.api.verifyTOTP` is called for its side effect of throwing on a wrong
 * or missing code; nothing here reads what it returns.
 */
export async function regenerateBackupCodes(
  code: string
): Promise<TwoFactorStepUpState> {
  await requireSession()

  if (!CODE_PATTERN.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." }
  }

  const requestHeaders = await headers()

  try {
    await auth.api.verifyTOTP({
      headers: requestHeaders,
      body: { code },
    })

    const result = await auth.api.generateBackupCodes({
      headers: requestHeaders,
      body: {},
    })

    return { backupCodes: result.backupCodes }
  } catch (error) {
    return { error: describeTwoFactorError(error) }
  }
}

export type DisableTwoFactorState = { error: string } | null

/**
 * Turns off TOTP for the current user, after the same step-up
 * `regenerateBackupCodes` uses.
 *
 * The step-up is the ONLY barrier here. `auth.api.disableTwoFactor` runs
 * behind Better Auth's `sensitiveSessionMiddleware`, which in 1.7.5 only
 * re-reads the session from the database (bypassing the cookie cache) — it
 * does not check the session's age. Freshness lives in the separate
 * `freshSessionMiddleware`, which this endpoint does not use.
 */
export async function disableTwoFactor(
  code: string
): Promise<DisableTwoFactorState> {
  await requireSession()

  if (!CODE_PATTERN.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." }
  }

  const requestHeaders = await headers()

  try {
    await auth.api.verifyTOTP({
      headers: requestHeaders,
      body: { code },
    })

    await auth.api.disableTwoFactor({
      headers: requestHeaders,
      body: {},
    })

    return null
  } catch (error) {
    return { error: describeTwoFactorError(error) }
  }
}
