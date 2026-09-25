"use client"

import { useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { authClient } from "@/lib/auth-client"
import { useTranslations } from "next-intl"
import { PasskeysSection } from "@/components/settings/passkeys-section"
import { SessionsSection } from "@/components/settings/sessions-section"
import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"
import {
  TwoFactorSetupDialog,
  useTwoFactorEnrollment,
} from "@/components/settings/two-factor-setup-dialog"
import { TwoFactorStepUpDialog } from "@/components/settings/two-factor-step-up-dialog"

type TwoFactorDialog = "none" | "setup" | "regenerate" | "disable"

function SecuritySkeleton() {
  const t = useTranslations("Settings")
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        title={t("twoFactor")}
        description={t("twoFactorDescription")}
      >
        <SettingsRow>
          <ItemContent className="gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-64" />
          </ItemContent>
          <Skeleton className="h-8 w-20" />
        </SettingsRow>
      </SettingsGroup>
      <PasskeysSection />
      <SessionsSection />
    </div>
  )
}

export function SecuritySection() {
  const t = useTranslations("Settings")
  const { data: session, error, isPending, refetch } = authClient.useSession()
  const [dialog, setDialog] = useState<TwoFactorDialog>("none")
  const enrollment = useTwoFactorEnrollment()

  function openSetup() {
    setDialog("setup")
    void enrollment.start()
  }

  if (isPending) return <SecuritySkeleton />
  if (error)
    return (
      <SettingsGroup title={t("securityAndAccess")}>
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("couldNotLoadSecurity")}</ItemTitle>
            <ItemDescription>{error.message}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    )
  if (!session) return null

  const twoFactorEnabled = session.user.twoFactorEnabled ?? false
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        title={t("twoFactor")}
        description={t("twoFactorDescription")}
        action={
          <Badge
            variant={twoFactorEnabled ? "default" : "secondary"}
            className="mr-4"
          >
            {twoFactorEnabled ? t("on") : t("off")}
          </Badge>
        }
      >
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("authenticatorApp")}</ItemTitle>
            <ItemDescription>
              {twoFactorEnabled
                ? t("authenticatorRequired")
                : t("authenticatorExtraStep")}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {twoFactorEnabled ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog("regenerate")}
                >
                  {t("regenerateCodes")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDialog("disable")}
                >
                  {t("disable")}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={openSetup}>
                {t("enable")}
              </Button>
            )}
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
      <PasskeysSection />
      <SessionsSection />
      <TwoFactorSetupDialog
        open={dialog === "setup"}
        onOpenChange={(open) => {
          if (open) return
          enrollment.discard()
          setDialog("none")
        }}
        enrollment={enrollment.enrollment}
        onRetry={enrollment.start}
      />
      <TwoFactorStepUpDialog
        open={dialog === "regenerate"}
        action="regenerate"
        onOpenChange={(open) => setDialog(open ? "regenerate" : "none")}
      />
      <TwoFactorStepUpDialog
        open={dialog === "disable"}
        action="disable"
        onOpenChange={(open) => setDialog(open ? "disable" : "none")}
        onDisabled={() => setDialog("none")}
      />
    </div>
  )
}
