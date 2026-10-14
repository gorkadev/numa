"use server"

import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { APIError } from "better-auth/api"

import { auth } from "@/lib/auth"
import { requireSession } from "@/lib/session"

const CODE_PATTERN = /^\d{6}$/

/** Maps provider codes to safe, localized Settings copy. */
type TwoFactorErrorKey =
  | "invalidCode"
  | "stepUpRateLimited"
  | "stepUpAccountLocked"
  | "twoFactorNotEnabled"
  | "genericError"

function describeTwoFactorError(error: unknown): TwoFactorErrorKey {
  if (error instanceof APIError) {
    switch (error.body?.code) {
      case "INVALID_CODE":
        return "invalidCode"
      case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
        return "stepUpRateLimited"
      case "ACCOUNT_TEMPORARILY_LOCKED":
        return "stepUpAccountLocked"
      case "TWO_FACTOR_NOT_ENABLED":
        return "twoFactorNotEnabled"
      default:
        return "genericError"
    }
  }

  return "genericError"
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
  const t = await getTranslations("Settings")

  if (!CODE_PATTERN.test(code)) {
    return { error: t("invalidCodeFormat") }
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
    return { error: t(describeTwoFactorError(error)) }
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
  const t = await getTranslations("Settings")

  if (!CODE_PATTERN.test(code)) {
    return { error: t("invalidCodeFormat") }
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
    return { error: t(describeTwoFactorError(error)) }
  }
}
