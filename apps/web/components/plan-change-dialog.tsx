"use client"

import { useRef, useState, useTransition } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

type PlanChangeAction = (formData: FormData) => Promise<void>

type PlanChangeDialogProps = {
  action: PlanChangeAction
  direction: "upgrade" | "downgrade"
  estimatedCharge?: string
  extraCredits?: number
}

/**
 * Confirms a paid-plan change before it reaches the server action.
 *
 * The server action still owns authorization, proration, billing updates, and
 * redirects. This component only makes the customer-facing consequences clear
 * and keeps the dialog locked after the one permitted submission until that
 * redirect replaces it.
 */
export function PlanChangeDialog({
  action,
  direction,
  estimatedCharge,
  extraCredits,
}: PlanChangeDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionStarted = useRef(false)
  const pending = isPending || isSubmitting
  const isUpgrade = direction === "upgrade"

  function confirmPlanChange() {
    if (submissionStarted.current) return

    submissionStarted.current = true
    setIsSubmitting(true)

    startTransition(async () => {
      await action(new FormData())
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && pending) {
          eventDetails.cancel()
          return
        }

        setOpen(nextOpen)
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            className="w-full"
            variant={isUpgrade ? "default" : "outline"}
            disabled={pending}
          />
        }
      >
        {isUpgrade ? "Upgrade to Max" : "Switch to Pro"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isUpgrade ? "Upgrade to Max?" : "Switch to Pro?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isUpgrade ? (
              <>
                {estimatedCharge
                  ? `You’ll be charged about ${estimatedCharge} today for the prorated difference.`
                  : "You’ll be charged an approximate prorated amount today."}{" "}
                Max benefits start immediately, including
                {extraCredits !== undefined
                  ? ` ${extraCredits.toLocaleString()} extra credits today`
                  : " additional credits today"}{" "}
                and 5,500 credits each month.
              </>
            ) : (
              <>
                You won&rsquo;t be charged or refunded today. Your Max benefits
                continue through the current billing cycle, and Pro starts with
                your next billing cycle.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirmPlanChange}>
            {pending ? <Spinner /> : null}
            {pending
              ? "Updating plan..."
              : isUpgrade
                ? "Upgrade to Max"
                : "Switch to Pro"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
