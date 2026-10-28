"use client"

import { useState, useTransition } from "react"
import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "@workspace/ui/components/toast"

import { cancelSubscriptionAction } from "@/lib/polar/cancellation-actions"
import {
  CANCELLATION_COMMENT_MAX_LENGTH,
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/polar/cancellation"

/** Monthly credits per plan, the same figures the pricing page advertises. */
const MONTHLY_CREDITS = { free: 100, pro: 2000, max: 5500 } as const

type Step = "loss" | "reason" | "confirm"

const reasonKeys = {
  too_expensive: "reasonTooExpensive",
  missing_features: "reasonMissingFeatures",
  low_quality: "reasonLowQuality",
  too_complex: "reasonTooComplex",
  unused: "reasonUnused",
  switched_service: "reasonSwitchedService",
  customer_service: "reasonCustomerService",
  other: "reasonOther",
} as const satisfies Record<CancellationReason, string>

/**
 * Three deliberate steps before a cancellation reaches Polar: what the plan
 * stops giving, why they are leaving (sent to Polar as the cancellation
 * reason), and a last confirmation. "Keep my plan" is the primary action on
 * every step; the destructive button only exists on the last one.
 */
export function CancelSubscriptionDialog({
  plan,
  endsAt,
  onCancelled,
}: {
  plan: "pro" | "max"
  /** Already formatted end of the current period. */
  endsAt: string
  onCancelled: () => void
}) {
  const t = useTranslations("Billing")
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("loss")
  const [reason, setReason] = useState<CancellationReason | null>(null)
  const [comment, setComment] = useState("")
  const [pending, startTransition] = useTransition()
  const planName = plan === "pro" ? "Pro" : "Max"

  function reset() {
    setStep("loss")
    setReason(null)
    setComment("")
  }

  function confirm() {
    if (!reason) return

    startTransition(async () => {
      const result = await cancelSubscriptionAction({ reason, comment })

      if (result === "ok") {
        setOpen(false)
        toast.add({
          title: t("cancelledTitle"),
          description: t("cancelledDescription", { date: endsAt }),
        })
        onCancelled()
        return
      }

      toast.add({ type: "error", title: t("cancelFailed") })
    })
  }

  const losses = [
    t("lossCredits", {
      credits: format.number(MONTHLY_CREDITS[plan]),
      date: endsAt,
    }),
    t("lossTopUps"),
    ...(plan === "max" ? [t("lossMaxRate")] : []),
    t("lossFree", { credits: format.number(MONTHLY_CREDITS.free) }),
  ]

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
      /**
       * Reset only once the exit animation has finished: resetting on close
       * swaps the fading popup back to the first step mid-animation, which
       * reads as a flicker.
       */
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) reset()
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="destructive" size="sm" />}
      >
        {t("cancelSubscription")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        {step === "loss" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("lossTitle", { plan: planName })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("lossDescription", { date: endsAt })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="flex flex-col gap-2 text-sm">
              {losses.map((loss) => (
                <li key={loss} className="flex items-start gap-2">
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span>{loss}</span>
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setStep("reason")}>
                {t("continueCancelling")}
              </Button>
              <AlertDialogCancel variant="default">
                {t("keepPlan")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}

        {step === "reason" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("reasonTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("reasonDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <FieldSet>
              <FieldLegend className="sr-only">{t("reasonTitle")}</FieldLegend>
              {/** The same muted block as the token footer in the sub-agent detail panel. */}
              <RadioGroup
                value={reason}
                onValueChange={(value) =>
                  setReason(value as CancellationReason)
                }
                className="gap-3 rounded-2xl bg-muted p-4"
              >
                {CANCELLATION_REASONS.map((value) => (
                  <Field key={value} orientation="horizontal">
                    <RadioGroupItem value={value} id={`reason-${value}`} />
                    <FieldLabel htmlFor={`reason-${value}`} className="font-normal">
                      {t(reasonKeys[value])}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              <Field>
                <FieldLabel htmlFor="cancel-comment">
                  {reason === "other"
                    ? t("commentLabelRequired")
                    : t("commentLabel")}
                </FieldLabel>
                <Textarea
                  id="cancel-comment"
                  value={comment}
                  maxLength={CANCELLATION_COMMENT_MAX_LENGTH}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("commentPlaceholder")}
                />
              </Field>
            </FieldSet>
            <AlertDialogFooter>
              <Button variant="ghost" onClick={() => setStep("loss")}>
                {t("back")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  !reason || (reason === "other" && comment.trim() === "")
                }
                onClick={() => setStep("confirm")}
              >
                {t("continueCancelling")}
              </Button>
              <AlertDialogCancel variant="default">
                {t("keepPlan")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmCancelTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirmCancelDescription", {
                  plan: planName,
                  date: endsAt,
                  credits: format.number(MONTHLY_CREDITS.free),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {plan === "max" && (
              <p className="text-sm text-muted-foreground">
                {t("switchToProHint")}{" "}
                <Link
                  href="/pricing"
                  className="font-medium text-foreground underline underline-offset-4"
                  onClick={() => setOpen(false)}
                >
                  {t("switchToProLink")}
                </Link>
              </p>
            )}
            <AlertDialogFooter>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setStep("reason")}
              >
                {t("back")}
              </Button>
              <Button variant="destructive" disabled={pending} onClick={confirm}>
                {pending && <Spinner data-icon="inline-start" />}
                {t("confirmCancel")}
              </Button>
              <AlertDialogCancel variant="default" disabled={pending}>
                {t("keepPlan")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
