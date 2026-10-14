"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import {
  AlertCircleIcon,
  FingerPrintIcon,
  GithubIcon,
  GoogleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Particles } from "@workspace/ui/components/particles"
import { Separator } from "@workspace/ui/components/separator"
import { toast } from "@workspace/ui/components/toast"

import { Spinner } from "@/components/localized-spinner"
import { authClient } from "@/lib/auth-client"
import { useTranslations } from "next-intl"

/**
 * Where Better Auth sends a failed OAuth round trip, per flow. It matches
 * `onAPIError.errorURL` in `lib/auth.ts`, which covers the failures that
 * cannot read this value back — see that file's note.
 */
const ERROR_CALLBACK_URL = "/sign-in"

/**
 * User-facing copy for the `?error=<code>` Better Auth appends on failure.
 * Only the code is trusted, never the accompanying `error_description`: both
 * arrive in a URL anyone can craft, so rendering the description verbatim
 * would let a link put arbitrary text on this page. Unknown codes fall back
 * to a generic message.
 */
const ERROR_MESSAGES: Record<string, [string, string]> = {
  access_denied: ["signInCancelledTitle", "signInCancelledDescription"],
  state_mismatch: ["signInExpiredTitle", "signInExpiredDescription"],
  email_not_found: ["noEmailTitle", "noEmailDescription"],
  email_not_verified: ["emailNotVerifiedTitle", "emailNotVerifiedDescription"],
  account_already_linked_to_different_user: ["accountAlreadyUsedTitle", "accountAlreadyUsedDescription"],
  unable_to_link_account: ["couldNotLinkTitle", "couldNotLinkDescription"],
}

type AuthMessageKey =
  | "signInCancelledTitle" | "signInCancelledDescription"
  | "signInExpiredTitle" | "signInExpiredDescription"
  | "noEmailTitle" | "noEmailDescription"
  | "emailNotVerifiedTitle" | "emailNotVerifiedDescription"
  | "accountAlreadyUsedTitle" | "accountAlreadyUsedDescription"
  | "couldNotLinkTitle" | "couldNotLinkDescription"
  | "signInFailedTitle" | "signInFailedDescription"

/**
 * The hint on whichever button worked last time.
 *
 * Rendered as an always-present slot rather than a conditional sibling so
 * the three buttons keep identical content boxes: a badge that appears in
 * one of them a frame after mount would otherwise nudge that button's label
 * as it lands.
 */
function LastUsed({ shown }: { shown: boolean }) {
  const t = useTranslations("Auth")
  return (
    <Badge
      variant="secondary"
      className="absolute -top-2 -right-2"
      hidden={!shown}
    >
      {t("lastUsed")}
    </Badge>
  )
}

/**
 * Social sign-in only — there is no email provider configured for this
 * project, so there is no form here to fall back to. `signIn.social` sends
 * the browser through the provider's own OAuth flow and back to
 * `/api/auth/callback/<provider>`, which Better Auth's route handler in
 * `app/api/auth/[...all]/route.ts` answers; `callbackURL` is where the
 * browser lands once that round trip completes, and `errorCallbackURL`
 * where it lands when it fails, with the failure code as `error`. The same
 * call creates the account on first use, so this page is both sign-in and
 * sign-up.
 */
export function AuthPage({ error }: { error?: string }) {
  const t = useTranslations("Auth")
  const errorKeys = error ? ERROR_MESSAGES[error] : undefined
  const errorMessage = error
    ? {
        title: t((errorKeys?.[0] ?? "signInFailedTitle") as AuthMessageKey),
        description: t((errorKeys?.[1] ?? "signInFailedDescription") as AuthMessageKey),
      }
    : undefined

  const [signingInMethod, setSigningInMethod] = useState<
    "google" | "github" | "passkey" | null
  >(null)
  const signInInFlight = useRef(false)

  /**
   * Read after mount, never during render: `getLastUsedLoginMethod()` reads
   * `document.cookie`, which does not exist while this page is being rendered
   * on the server. Deriving it inline would make the server and the client
   * disagree about which button carries the badge, and React would throw a
   * hydration mismatch over it. Starting at `null` means the first paint has
   * no badge anywhere and it appears a frame later — the honest sequence,
   * given the server genuinely does not know the answer.
   */
  const [lastMethod, setLastMethod] = useState<string | null>(null)

  useEffect(() => {
    setLastMethod(authClient.getLastUsedLoginMethod())
  }, [])

  /**
   * Unlike the social buttons, this one stays on the page: the WebAuthn
   * ceremony resolves in place, so the redirect is ours to perform.
   *
   * A dismissed prompt is not an error — same reasoning as the passkey
   * registration in settings — so only a real failure raises a toast.
   */
  async function signInWithSocial(provider: "google" | "github") {
    if (signInInFlight.current) return

    signInInFlight.current = true
    setSigningInMethod(provider)

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/",
        errorCallbackURL: ERROR_CALLBACK_URL,
      })

      if (result?.error) {
        toast.add({
          type: "error",
          title: t("couldNotStartSignIn"),
          description: t("somethingWentWrongDescription"),
        })
      }
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotStartSignIn"),
        description: t("somethingWentWrongDescription"),
      })
    } finally {
      signInInFlight.current = false
      setSigningInMethod(null)
    }
  }

  async function signInWithPasskey() {
    if (signInInFlight.current) return

    signInInFlight.current = true
    setSigningInMethod("passkey")
    let navigating = false

    try {
      const result = await authClient.signIn.passkey()

      if (result?.error) {
        const cancelled =
          "code" in result.error && result.error.code === "AUTH_CANCELLED"

        if (!cancelled) {
          toast.add({
            type: "error",
            title: t("couldNotSignIn"),
            description: t("somethingWentWrongDescription"),
          })
        }

        return
      }

      window.location.assign("/")
      navigating = true
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotSignIn"),
        description: t("somethingWentWrongDescription"),
      })
    } finally {
      if (!navigating) {
        signInInFlight.current = false
        setSigningInMethod(null)
      }
    }
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
                <h1>{t("signInTitle")}</h1>
              </CardTitle>
              <CardDescription>
                {t("signInDescription")}
              </CardDescription>
            </CardHeader>
            {errorMessage && (
              <CardContent>
                <Alert variant="destructive">
                  <HugeiconsIcon icon={AlertCircleIcon} />
                  <AlertTitle>{errorMessage.title}</AlertTitle>
                  <AlertDescription>
                    {errorMessage.description}
                  </AlertDescription>
                </Alert>
              </CardContent>
            )}
            <CardContent>
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  className="relative w-full"
                  type="button"
                  disabled={signingInMethod !== null}
                  onClick={() => signInWithSocial("google")}
                >
                  {signingInMethod === "google" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                  )}
                  {t("continueGoogle")}
                  <LastUsed shown={lastMethod === "google"} />
                </Button>
                <Button
                  className="relative w-full"
                  type="button"
                  disabled={signingInMethod !== null}
                  onClick={() => signInWithSocial("github")}
                >
                  {signingInMethod === "github" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" />
                  )}
                  {t("continueGithub")}
                  <LastUsed shown={lastMethod === "github"} />
                </Button>

                {/**
                 * Separated from the providers above because it is a
                 * different KIND of answer: the two buttons hand the browser
                 * to somebody else and come back, this one never leaves the
                 * page. It is also only useful to someone who has already
                 * registered a passkey on this device, so it reads as the
                 * shortcut it is rather than as a third provider.
                 */}
                <div className="flex items-center gap-3 py-1">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">{t("or")}</span>
                  <Separator className="flex-1" />
                </div>

                <Button
                  variant="outline"
                  className="relative w-full"
                  type="button"
                  disabled={signingInMethod !== null}
                  onClick={signInWithPasskey}
                >
                  {signingInMethod === "passkey" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon
                      icon={FingerPrintIcon}
                      data-icon="inline-start"
                    />
                  )}
                  {t("continuePasskey")}
                  <LastUsed shown={lastMethod === "passkey"} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
