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
import { useLocale, useTranslations } from "next-intl"

import { Spinner } from "@/components/localized-spinner"

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
  const t = useTranslations("Pricing")
  const locale = useLocale()
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
        {isUpgrade ? t("upgradeToMax") : t("switchToPro")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isUpgrade ? t("upgradeTitle") : t("downgradeTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialogDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview ? (
          <dl className="grid gap-3 text-sm">
            <div className="grid gap-1">
              <dt className="text-muted-foreground">{t("currentPlanLabel")}</dt>
              <dd className="font-medium">{preview.currentPlan}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">{t("targetPlanLabel")}</dt>
              <dd className="font-medium">{preview.targetPlan}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">{t("currentBillingCycle")}</dt>
              <dd>
                {preview.currentPeriodStart} – {preview.currentPeriodEnd}
              </dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">{t("takesEffectLabel")}</dt>
              <dd>{preview.effectiveDate}</dd>
            </div>
            {preview.renewalDate ? (
              <div className="grid gap-1">
                <dt className="text-muted-foreground">{t("nextRenewal")}</dt>
                <dd>{preview.renewalDate}</dd>
              </div>
            ) : null}
            <div className="grid gap-1">
              <dt className="text-muted-foreground">{t("today")}</dt>
              <dd>{preview.immediateConsequence}</dd>
            </div>
            {isUpgrade && preview.extraCredits !== undefined ? (
              <div className="grid gap-1">
                <dt className="text-muted-foreground">{t("extraCreditsToday")}</dt>
                <dd>{new Intl.NumberFormat(locale).format(preview.extraCredits)}</dd>
              </div>
            ) : null}
          </dl>
        ) : isUpgrade ? (
          <p className="text-sm text-muted-foreground">
            {t("fallbackUpgrade")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("fallbackDowngrade")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={confirmPlanChange}>
            {pending ? <Spinner /> : null}
            {pending
              ? t("updatingPlan")
              : isUpgrade
                ? t("upgradeToMax")
                : t("switchToPro")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
