"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { useTranslations } from "next-intl"

import { Spinner } from "@/components/localized-spinner"

import {
  disableTwoFactor,
  regenerateBackupCodes,
} from "@/lib/two-factor/actions"
import { RecoveryCodes } from "@/components/settings/recovery-codes"

type Action = "regenerate" | "disable"

type SettingsMessageKey =
  | "invalidCode"
  | "stepUpRateLimited"
  | "stepUpAccountLocked"
  | "twoFactorNotEnabled"
  | "invalidCodeFormat"

function localizeActionError(message: string, t: (key: SettingsMessageKey) => string) {
  const messages: Record<string, SettingsMessageKey> = {
    "That code didn't work. Check your authenticator app and try again.": "invalidCode",
    "Too many attempts. Wait a moment and try again.": "stepUpRateLimited",
    "Too many failed attempts. Try again in 15 minutes.": "stepUpAccountLocked",
    "Two-factor authentication isn't enabled on your account.": "twoFactorNotEnabled",
    "Enter the 6-digit code from your authenticator app.": "invalidCodeFormat",
  }
  const key = messages[message]
  return key ? t(key) : message
}

const COPY = {
  regenerate: ["regenerateRecoveryCodes", "recoveryCodesWillStopWorking"],
  disable: ["disableTwoFactor", "onlySocialSignIn"],
} as const

/**
 * The TOTP step-up prompt shared by "Regenerate codes" and "Disable" in
 * `security-section.tsx`.
 *
 * Both server actions it calls — `regenerateBackupCodes` and
 * `disableTwoFactor` in `lib/two-factor/actions.ts` — re-verify a live TOTP
 * code before touching anything, because `lib/auth.ts`'s
 * `allowPasswordless: true` means a session alone is not proof the caller
 * still holds the authenticator app. This dialog is what collects that
 * proof; see the actions file for why it cannot be skipped.
 */
export function TwoFactorStepUpDialog({
  open,
  onOpenChange,
  action,
  onDisabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: Action
  /** Called after a successful disable, once the dialog can safely close. */
  onDisabled?: () => void
}) {
  const t = useTranslations("Settings")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const attemptIdRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  function resetState() {
    attemptIdRef.current++
    setCode("")
    setError(null)
    setBackupCodes(null)
  }

  function handleCancel() {
    if (pending) return
    resetState()
    onOpenChange(false)
  }

  function handleDone() {
    resetState()
    onOpenChange(false)
  }

  async function handleConfirm() {
    const attemptId = ++attemptIdRef.current
    setPending(true)
    setError(null)

    try {
      if (action === "regenerate") {
        const result = await regenerateBackupCodes(code)
        if (!mountedRef.current || attemptId !== attemptIdRef.current) return

        if ("error" in result) {
          setCode("")
          setError(localizeActionError(result.error, t))
          return
        }

        setBackupCodes(result.backupCodes)
        return
      }

      const result = await disableTwoFactor(code)
      if (!mountedRef.current || attemptId !== attemptIdRef.current) return

      if (result?.error) {
        setCode("")
        setError(localizeActionError(result.error, t))
        return
      }

      resetState()
      onOpenChange(false)
      onDisabled?.()
    } catch {
      if (mountedRef.current && attemptId === attemptIdRef.current) {
        setCode("")
        setError(t("genericError"))
      }
    } finally {
      if (mountedRef.current && attemptId === attemptIdRef.current) {
        setPending(false)
      }
    }
  }

  const showingCodes = action === "regenerate" && backupCodes !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        // Same rule as `two-factor-setup-dialog.tsx`: a fresh set of
        // recovery codes is shown at most once, so nothing but the
        // explicit "Done" button may close this dialog while they're on
        // screen.
        if (!nextOpen && (showingCodes || pending)) {
          eventDetails.cancel()
          return
        }

        if (!nextOpen) {
          resetState()
        }

        onOpenChange(nextOpen)
      }}
    >
      <DialogContent showCloseButton={!showingCodes && !pending}>
        <DialogHeader>
          <DialogTitle>
            {showingCodes ? t("newRecoveryCodes") : t(COPY[action][0])}
          </DialogTitle>
          <DialogDescription>
            {showingCodes
              ? t("oldRecoveryCodesInvalid")
              : t(COPY[action][1])}
          </DialogDescription>
        </DialogHeader>

        {showingCodes && backupCodes ? (
          <RecoveryCodes codes={backupCodes} onDone={handleDone} />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t("enterCodeToContinue")}
              </p>
              <InputOTP
                maxLength={6}
                aria-label={t("enterCodeToContinue")}
                value={code}
                onChange={(value) => {
                  setCode(value)
                  setError(null)
                }}
                disabled={pending}
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={handleCancel}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant={action === "disable" ? "destructive" : "default"}
                onClick={handleConfirm}
                disabled={code.length !== 6 || pending}
              >
                {pending && <Spinner />}
                {action === "disable" ? t("disable") : t("regenerateCodes")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
