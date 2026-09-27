"use client"

import { useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { AlertCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { Particles } from "@workspace/ui/components/particles"

import { Spinner } from "@/components/localized-spinner"
import { authClient } from "@/lib/auth-client"
import { useTranslations } from "next-intl"

type ErrorMessage = {
  title: string
  description: string
  showBackLink?: boolean
}

/**
 * User-facing copy for the codes this page's two verify calls can fail
 * with. See `error-code.mjs` for the exhaustive list of what
 * `verifyTotp`/`verifyBackupCode` can throw. `INVALID_TWO_FACTOR_COOKIE` is
 * reachable because the `two_factor` cookie `lib/oauth-two-factor.ts` issues
 * is short-lived (10 minutes) and consumed once a session is created.
 */
type AuthMessageKey =
  | "incorrectCodeTitle" | "incorrectCodeDescription"
  | "attemptExpiredTitle" | "attemptExpiredDescription"
  | "accountLockedTitle" | "accountLockedDescription"
  | "tooManyAttemptsTitle" | "tooManyAttemptsDescription"
  | "somethingWentWrongTitle" | "somethingWentWrongDescription"

const ERROR_MESSAGES: Record<string, [AuthMessageKey, AuthMessageKey, boolean?]> = {
  INVALID_CODE: ["incorrectCodeTitle", "incorrectCodeDescription"],
  INVALID_BACKUP_CODE: ["incorrectCodeTitle", "incorrectCodeDescription"],
  INVALID_TWO_FACTOR_COOKIE: ["attemptExpiredTitle", "attemptExpiredDescription", true],
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: ["attemptExpiredTitle", "attemptExpiredDescription", true],
  ACCOUNT_TEMPORARILY_LOCKED: ["accountLockedTitle", "accountLockedDescription"],
}

function describeError(error: { status?: number; code?: string | null }, t: (key: AuthMessageKey) => string): ErrorMessage {
  const keys: readonly [AuthMessageKey, AuthMessageKey, boolean?] = error.status === 429
    ? ["tooManyAttemptsTitle", "tooManyAttemptsDescription"] as const
    : ERROR_MESSAGES[error.code ?? ""] ?? ["somethingWentWrongTitle", "somethingWentWrongDescription"]
  return { title: t(keys[0]), description: t(keys[1]), showBackLink: keys[2] === true }
}

/**
 * The TOTP sign-in challenge, reached only through
 * `lib/oauth-two-factor.ts`'s `TWO_FACTOR_CHALLENGE_URL` redirect — a social
 * sign-in that resolved to a user with TOTP enabled and no valid trusted-
 * device cookie. There is no session at this point, only the plugin's
 * short-lived `two_factor` cookie, which is what `verifyTotp`/
 * `verifyBackupCode` verify against.
 *
 * # Why success navigates with `window.location.assign` instead of
 *   `router.push`
 *
 * The session this page creates is a cookie, and every Server Component
 * above `/` — the `(app)` layout, `page.tsx` itself — reads that cookie
 * during its own render. A client-side `router.push` would swap in those
 * Server Components' output without a fresh request, so they would render
 * against the OLD (missing) cookie. A full navigation is what guarantees
 * the destination renders signed in.
 */
export function TwoFactorChallenge() {
  const t = useTranslations("Auth")
  const [mode, setMode] = useState<"totp" | "backup">("totp")
  const [code, setCode] = useState("")
  const [trustDevice, setTrustDevice] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ErrorMessage | null>(null)

  async function submitTotp(value: string) {
    if (pending) return

    setPending(true)
    setError(null)

    const { error: verifyError } = await authClient.twoFactor.verifyTotp({
      code: value,
      trustDevice,
    })

    if (verifyError) {
      setPending(false)
      setCode("")
      setError(describeError(verifyError, t))
      return
    }

    window.location.assign("/")
  }

  async function submitBackupCode(event: FormEvent) {
    event.preventDefault()
    if (pending || !code) return

    setPending(true)
    setError(null)

    const { error: verifyError } = await authClient.twoFactor.verifyBackupCode({
      code,
      trustDevice,
    })

    if (verifyError) {
      setPending(false)
      setCode("")
      setError(describeError(verifyError, t))
      return
    }

    window.location.assign("/")
  }

  function switchMode(nextMode: "totp" | "backup") {
    setMode(nextMode)
    setCode("")
    setError(null)
  }

  return (
    <div className="relative w-full md:h-screen md:overflow-hidden">
      <Particles
        className="absolute inset-0"
        color="#666666"
        ease={20}
        quantity={120}
      />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-8">
        <div className="mx-auto space-y-4 sm:w-sm">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Numa"
              width={20}
              height={24}
              priority
              className="size-6"
            />
            <span className="text-lg font-medium">Numa</span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                <h1>{t("twoFactorTitle")}</h1>
              </CardTitle>
              <CardDescription>
                {mode === "totp"
                  ? t("enterAuthenticatorCode")
                  : t("enterRecoveryCode")}
              </CardDescription>
            </CardHeader>

            {error && (
              <CardContent>
                <Alert variant="destructive">
                  <HugeiconsIcon icon={AlertCircleIcon} />
                  <AlertTitle>{error.title}</AlertTitle>
                  <AlertDescription>
                    {error.description}
                    {error.showBackLink && (
                      <>
                        {" "}
                        <Link href="/sign-in">{t("backToSignIn")}</Link>
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              </CardContent>
            )}

            <CardContent>
              {mode === "totp" ? (
                <div className="space-y-4">
                  <InputOTP
                    maxLength={6}
                    aria-label={t("enterAuthenticatorCode")}
                    value={code}
                    disabled={pending}
                    onChange={(value) => {
                      setCode(value)
                      if (value.length === 6) submitTotp(value)
                    }}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>

                  <Field orientation="horizontal">
                    <Checkbox
                      id="trust-device"
                      checked={trustDevice}
                      onCheckedChange={setTrustDevice}
                      disabled={pending}
                    />
                    <FieldLabel htmlFor="trust-device" className="font-normal">
                      {t("trustDevice")}
                    </FieldLabel>
                  </Field>

                  {pending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner />
                      {t("verifying")}
                    </div>
                  )}
                </div>
              ) : (
                <form className="space-y-4" onSubmit={submitBackupCode}>
                  <Input
                    autoFocus
                    placeholder="XXXXX-XXXXX"
                    aria-label={t("enterRecoveryCode")}
                    value={code}
                    disabled={pending}
                    onChange={(event) => setCode(event.target.value)}
                  />

                  <Field orientation="horizontal">
                    <Checkbox
                      id="trust-device-backup"
                      checked={trustDevice}
                      onCheckedChange={setTrustDevice}
                      disabled={pending}
                    />
                    <FieldLabel
                      htmlFor="trust-device-backup"
                      className="font-normal"
                    >
                      {t("trustDevice")}
                    </FieldLabel>
                  </Field>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={pending || !code}
                  >
                    {pending && <Spinner />}
                    {t("verify")}
                  </Button>
                </form>
              )}
            </CardContent>

            <CardFooter>
              <div className="flex flex-col gap-1 text-sm">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto justify-start p-0"
                  onClick={() =>
                    switchMode(mode === "totp" ? "backup" : "totp")
                  }
                >
                  {mode === "totp"
                    ? t("useRecoveryCode")
                    : t("useAuthenticator")}
                </Button>
                <Link
                  href="/sign-in"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t("backToSignIn")}
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
