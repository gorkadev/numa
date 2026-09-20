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

type PlanChangePreview = {
  currentPlan: string
  targetPlan: string
  currentPeriodStart: string
  currentPeriodEnd: string
  effectiveDate: string
  renewalDate?: string
  immediateConsequence: string
  extraCredits?: number
}

type PlanChangeDialogProps = {
  action: PlanChangeAction
  direction: "upgrade" | "downgrade"
  preview?: PlanChangePreview
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
  preview,
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
            Review the billing consequences before confirming this change.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview ? (
          <dl className="grid gap-3 text-sm">
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Current plan</dt>
              <dd className="font-medium">{preview.currentPlan}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Target plan</dt>
              <dd className="font-medium">{preview.targetPlan}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Current billing cycle</dt>
              <dd>
                {preview.currentPeriodStart} – {preview.currentPeriodEnd}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Takes effect</dt>
              <dd>{preview.effectiveDate}</dd>
            </div>
            {preview.renewalDate ? (
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Next renewal</dt>
                <dd>{preview.renewalDate}</dd>
              </div>
            ) : null}
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Today</dt>
              <dd>{preview.immediateConsequence}</dd>
            </div>
            {isUpgrade && preview.extraCredits !== undefined ? (
              <div className="grid gap-1">
                <dt className="text-muted-foreground">Extra credits today</dt>
                <dd>{preview.extraCredits.toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>
        ) : isUpgrade ? (
          <p className="text-sm text-muted-foreground">
            You’ll be charged an approximate prorated amount today. Max benefits
            start immediately, including additional credits today.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            You won&rsquo;t be charged or refunded today. Your Max benefits
            continue through the current billing cycle, and Pro starts with your
            next billing cycle.
          </p>
        )}
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
