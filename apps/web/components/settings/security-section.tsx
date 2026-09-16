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

/** Which step-up-gated dialog, if any, is currently open. */
type TwoFactorDialog = "none" | "setup" | "regenerate" | "disable"

/**
 * The Security section of the settings dialog: two-factor authentication,
 * then the account's active sessions.
 *
 * # Why this is a real component and not inlined in `settings-dialog.tsx`
 *
 * Every other section there is a few lines of JSX reading props the dialog
 * already has. This one owns three pieces of dialog state (setup,
 * regenerate, disable) — plumbing the other sections don't need — so it gets
 * its own file the same way `credits-button.tsx` was split out of
 * `app-sidebar.tsx` once it grew a reason to exist independently. The
 * sessions list went one step further into `sessions-section.tsx`: it owns
 * its own fetch and revoke state and shares nothing with the 2FA dialogs.
 */
export function SecuritySection() {
  const { data: session } = authClient.useSession()

  const [dialog, setDialog] = useState<TwoFactorDialog>("none")
  const enrollment = useTwoFactorEnrollment()

  function openSetup() {
    setDialog("setup")
    enrollment.start()
  }

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
