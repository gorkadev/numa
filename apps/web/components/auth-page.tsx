"use client"

import { useEffect, useState } from "react"
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
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "@workspace/ui/components/toast"

import { authClient } from "@/lib/auth-client"

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
const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  access_denied: {
    title: "Sign-in cancelled",
    description: "You cancelled the sign-in. Pick a provider to try again.",
  },
  state_mismatch: {
    title: "Your sign-in expired",
    description:
      "The sign-in took too long or was opened in another tab. Please try again.",
  },
  email_not_found: {
    title: "No email address shared",
    description:
      "Your account did not share an email address with Numa. Allow email access or try another provider.",
  },
  email_not_verified: {
    title: "Email not verified",
    description: "Verify your email address with the provider, then try again.",
  },
  account_already_linked_to_different_user: {
    title: "Account already in use",
    description: "This account is already linked to a different Numa user.",
  },
  unable_to_link_account: {
    title: "Could not link your account",
    description: "Sign in with the provider you used the first time.",
  },
}

const FALLBACK_ERROR = {
  title: "Sign-in failed",
  description: "Something went wrong while signing you in. Please try again.",
}

/**
 * The hint on whichever button worked last time.
 *
 * Rendered as an always-present slot rather than a conditional sibling so
 * the three buttons keep identical content boxes: a badge that appears in
 * one of them a frame after mount would otherwise nudge that button's label
 * as it lands.
 */
function LastUsed({ shown }: { shown: boolean }) {
  return (
    <Badge variant="secondary" className="absolute -right-2 -top-2" hidden={!shown}>
      Last used
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
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? FALLBACK_ERROR)
    : undefined

  const [signingIn, setSigningIn] = useState(false)

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
  async function signInWithPasskey() {
    setSigningIn(true)

    const result = await authClient.signIn.passkey()

    if (result?.error) {
      const cancelled =
        "code" in result.error && result.error.code === "AUTH_CANCELLED"

      if (!cancelled) {
        toast.add({
          type: "error",
          title: "Could not sign you in",
          description: result.error.message,
        })
      }

      setSigningIn(false)
      return
    }

    window.location.assign("/")
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
                <h1>Sign in or create your account</h1>
              </CardTitle>
              <CardDescription>
                Build your own racers, shooters, puzzles and whole worlds using
                your own words.
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
                  className="w-full relative"
                  type="button"
                  onClick={() =>
                    authClient.signIn.social({
                      provider: "google",
                      callbackURL: "/",
                      errorCallbackURL: ERROR_CALLBACK_URL,
                    })
                  }
                >
                  <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" />
                  Continue with Google
                  <LastUsed shown={lastMethod === "google"} />
                </Button>
                <Button
                  className="w-full relative"
                  type="button"
                  onClick={() =>
                    authClient.signIn.social({
                      provider: "github",
                      callbackURL: "/",
                      errorCallbackURL: ERROR_CALLBACK_URL,
                    })
                  }
                >
                  <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" />
                  Continue with GitHub
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
                  <span className="text-xs text-muted-foreground">or</span>
                  <Separator className="flex-1" />
                </div>

                <Button
                  variant="outline"
                  className="w-full relative"
                  type="button"
                  disabled={signingIn}
                  onClick={signInWithPasskey}
                >
                  {signingIn ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon
                      icon={FingerPrintIcon}
                      data-icon="inline-start"
                    />
                  )}
                  Continue with a passkey
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
