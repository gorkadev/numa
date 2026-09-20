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
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        title="Two-factor authentication"
        description="An extra step when you sign in, on top of your provider"
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
      <SettingsGroup title="Security & access">
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Could not load security settings</ItemTitle>
            <ItemDescription>{error.message}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
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
        title="Two-factor authentication"
        description="An extra step when you sign in, on top of your provider"
        action={
          <Badge
            variant={twoFactorEnabled ? "default" : "secondary"}
            className="mr-4"
          >
            {twoFactorEnabled ? "On" : "Off"}
          </Badge>
        }
      >
        <SettingsRow>
          <ItemContent>
            <ItemTitle>Authenticator app</ItemTitle>
            <ItemDescription>
              {twoFactorEnabled
                ? "Codes from your authenticator app are required to sign in."
                : "Add an authenticator app for an extra step when you sign in."}
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
                  Regenerate codes
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDialog("disable")}
                >
                  Disable
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={openSetup}>
                Enable
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
