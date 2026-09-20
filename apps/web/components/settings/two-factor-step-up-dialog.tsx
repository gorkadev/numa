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
import { Spinner } from "@workspace/ui/components/spinner"

import {
  disableTwoFactor,
  regenerateBackupCodes,
} from "@/lib/two-factor/actions"
import { RecoveryCodes } from "@/components/settings/recovery-codes"

type Action = "regenerate" | "disable"

const COPY: Record<Action, { title: string; description: string }> = {
  regenerate: {
    title: "Regenerate recovery codes",
    description: "Your current recovery codes will stop working.",
  },
  disable: {
    title: "Disable two-factor authentication",
    description: "You'll only need GitHub or Google to sign in.",
  },
}

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
          setError(result.error)
          return
        }

        setBackupCodes(result.backupCodes)
        return
      }

      const result = await disableTwoFactor(code)
      if (!mountedRef.current || attemptId !== attemptIdRef.current) return

      if (result?.error) {
        setCode("")
        setError(result.error)
        return
      }

      resetState()
      onOpenChange(false)
      onDisabled?.()
    } catch {
      if (mountedRef.current && attemptId === attemptIdRef.current) {
        setCode("")
        setError("Something went wrong. Try again.")
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
            {showingCodes ? "New recovery codes" : COPY[action].title}
          </DialogTitle>
          <DialogDescription>
            {showingCodes
              ? "Your old recovery codes no longer work."
              : COPY[action].description}
          </DialogDescription>
        </DialogHeader>

        {showingCodes && backupCodes ? (
          <RecoveryCodes codes={backupCodes} onDone={handleDone} />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app to continue.
              </p>
              <InputOTP
                maxLength={6}
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
                Cancel
              </Button>
              <Button
                type="button"
                variant={action === "disable" ? "destructive" : "default"}
                onClick={handleConfirm}
                disabled={code.length !== 6 || pending}
              >
                {pending && <Spinner />}
                {action === "disable" ? "Disable" : "Regenerate"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
