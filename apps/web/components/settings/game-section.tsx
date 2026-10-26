"use client"

import { useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Switch } from "@workspace/ui/components/switch"
import { toast } from "@workspace/ui/components/toast"

import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"
import { IMPROVER_DAILY_LIMIT } from "@/lib/games/improver/allowance"
import { publishImproverAllowanceStale } from "@/lib/games/improver/allowance-channel"
import {
  readGameSettings,
  setImproverOverageBilling,
} from "@/lib/settings/game-settings"

export function GameSettingsSection() {
  const t = useTranslations("Settings.game")
  const [overage, setOverage] = useState<boolean | null>(null)
  const [saving, startSaving] = useTransition()

  useEffect(() => {
    readGameSettings()
      .then((settings) => setOverage(settings.improverOverageBilling))
      .catch(() => setOverage(false))
  }, [])

  function change(next: boolean) {
    const previous = overage
    setOverage(next)
    startSaving(async () => {
      try {
        await setImproverOverageBilling(next)
        publishImproverAllowanceStale()
      } catch {
        setOverage(previous)
        toast.add({ type: "error", title: t("couldNotSave") })
      }
    })
  }

  return (
    <SettingsGroup title={t("improverTitle")} description={t("improverDescription", IMPROVER_DAILY_LIMIT)}>
      <SettingsRow>
        <ItemContent>
          <ItemTitle id="settings-improver-overage">{t("improverOverage")}</ItemTitle>
          <ItemDescription>{t("improverOverageDescription")}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            aria-labelledby="settings-improver-overage"
            checked={overage ?? false}
            disabled={overage === null || saving}
            onCheckedChange={change}
          />
        </ItemActions>
      </SettingsRow>
    </SettingsGroup>
  )
}
