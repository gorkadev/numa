"use client"

import { useState } from "react"
import {
  AlertCircleIcon,
  Copy01Icon,
  Download04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import { useFormatter, useTranslations } from "next-intl"

/**
 * Filename for the downloaded recovery codes. Not user-configurable — a
 * predictable name is one less thing to explain, and nothing here depends on
 * it being unique across downloads.
 */
const DOWNLOAD_FILENAME = "numa-recovery-codes.txt"

/**
 * Builds the plain-text file contents for the "Download" button: a short
 * header explaining what the file is, when it was generated, and the codes
 * themselves — one per line, matching the textarea above it so copy/paste
 * and download always agree.
 */
function buildDownloadContent(codes: string[], title: string, generatedAt: string, description: string): string {
  const header = [
    title,
    generatedAt,
    description,
    "",
  ].join("\n")

  return `${header}${codes.join("\n")}\n`
}

/**
 * The one-time view of a fresh set of recovery codes — shown after
 * `authClient.twoFactor.enable` and after regenerating codes through
 * `regenerateBackupCodes`.
 *
 * # Why the codes never leave component state
 *
 * They are the credential itself: sensitive backup codes for a fully
 * verified second factor. There is no localStorage/sessionStorage write and
 * no logging anywhere in this component's tree, and the caller is expected
 * to drop `codes` from its own state once this view closes — see the
 * `onDone` callers in `two-factor-setup-dialog.tsx` and
 * `two-factor-step-up-dialog.tsx`.
 *
 * # Why `onDone` is disabled until the checkbox is checked
 *
 * Nothing can show these codes again. Better Auth's only way to read them
 * back, `auth.api.viewBackupCodes`, is server-only and this application never
 * calls it — keep it that way, or "shown once" stops being true. Blocking
 * `onDone` is the only backstop against a user closing the dialog before
 * they have actually saved anything.
 */
export function RecoveryCodes({
  codes,
  onDone,
  doneLabel,
}: {
  codes: string[]
  onDone: () => void
  doneLabel?: string
}) {
  const t = useTranslations("Settings")
  const format = useFormatter()
  const finalDoneLabel = doneLabel ?? t("done")
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyCodes() {
    await navigator.clipboard.writeText(codes.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadCodes() {
    const blob = new Blob([buildDownloadContent(
      codes,
      t("recoveryCodesFileTitle"),
      t("recoveryCodesGeneratedAt", { date: format.dateTime(new Date(), { dateStyle: "medium", timeStyle: "short" }) }),
      t("recoveryCodesFileDescription")
    )], {
      type: "text/plain",
    })
    const url = URL.createObjectURL(blob)

    const link = document.createElement("a")
    link.href = url
    link.download = DOWNLOAD_FILENAME
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <HugeiconsIcon icon={AlertCircleIcon} />
        <AlertTitle>{t("saveRecoveryCodesTitle")}</AlertTitle>
        <AlertDescription>
          {t("recoveryCodesDescription")}
        </AlertDescription>
      </Alert>

      <Textarea
        readOnly
        value={codes.join("\n")}
        rows={codes.length}
        className="resize-none font-mono text-sm"
        aria-label={t("recoveryCodesAccessibleLabel")}
        onFocus={(event) => event.target.select()}
      />

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={copyCodes}>
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button type="button" variant="outline" onClick={downloadCodes}>
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
          {t("download")}
        </Button>
      </div>

      <Field orientation="horizontal">
        <Checkbox
          id="recovery-codes-ack"
          checked={acknowledged}
          onCheckedChange={setAcknowledged}
        />
        <FieldLabel htmlFor="recovery-codes-ack" className="font-normal">
          {t("recoveryCodesAcknowledgement")}
        </FieldLabel>
      </Field>

      <Button
        type="button"
        onClick={onDone}
        disabled={!acknowledged}
        className="self-end"
      >
        {finalDoneLabel}
      </Button>
    </div>
  )
}
