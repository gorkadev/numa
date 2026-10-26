"use client"

import { useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { toast } from "@workspace/ui/components/toast"

import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"
import { DEFAULT_TIER_ID, TIERS, isTierId } from "@/lib/ai/model-catalog"
import { IMPROVER_DAILY_LIMIT } from "@/lib/games/improver/allowance"
import { publishImproverAllowanceStale } from "@/lib/games/improver/allowance-channel"
import type {
  GameSettings,
  GameSettingsPatch,
} from "@/lib/settings/game-preferences"
import {
  readGameSettings,
  updateGameSettings,
} from "@/lib/settings/game-settings"

export function GameSettingsSection() {
  const t = useTranslations("Settings.game")
  const tiers = useTranslations("GameComposer.tiers")
  const router = useRouter()
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [saving, startSaving] = useTransition()

  useEffect(() => {
    readGameSettings()
      .then(setSettings)
      .catch(() =>
        setSettings({
          improverOverageBilling: false,
          defaultTierId: null,
          showSessionStats: true,
        })
      )
  }, [])

  /**
   * Optimistic, then saved. The refresh re-renders the server components that
   * read these settings — the new-game page and the game page — so a change
   * shows behind the dialog without a reload.
   */
  function change(patch: GameSettingsPatch) {
    const previous = settings
    if (!previous) return
    setSettings({ ...previous, ...patch })
    startSaving(async () => {
      try {
        setSettings(await updateGameSettings(patch))
        if ("improverOverageBilling" in patch) publishImproverAllowanceStale()
        router.refresh()
      } catch {
        setSettings(previous)
        toast.add({ type: "error", title: t("couldNotSave") })
      }
    })
  }

  const tierItems = TIERS.map((tier) => ({
    value: tier.id,
    label: tiers(`${tier.id}.label`),
  }))

  return (
    <>
      <SettingsGroup title={t("newGameTitle")}>
        <SettingsRow>
          <ItemContent>
            <ItemTitle id="settings-default-tier">{t("defaultTier")}</ItemTitle>
            <ItemDescription>{t("defaultTierDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Select
              value={settings?.defaultTierId ?? DEFAULT_TIER_ID}
              onValueChange={(value) => {
                if (isTierId(value)) change({ defaultTierId: value })
              }}
              items={tierItems}
            >
              <SelectTrigger
                aria-labelledby="settings-default-tier"
                disabled={settings === null || saving}
                className="w-full sm:w-auto"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tierItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title={t("chatTitle")}>
        <SettingsRow>
          <ItemContent>
            <ItemTitle id="settings-session-stats">{t("sessionStats")}</ItemTitle>
            <ItemDescription>{t("sessionStatsDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              aria-labelledby="settings-session-stats"
              checked={settings?.showSessionStats ?? true}
              disabled={settings === null || saving}
              onCheckedChange={(next) => change({ showSessionStats: next })}
            />
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title={t("improverTitle")} description={t("improverDescription", IMPROVER_DAILY_LIMIT)}>
        <SettingsRow>
          <ItemContent>
            <ItemTitle id="settings-improver-overage">{t("improverOverage")}</ItemTitle>
            <ItemDescription>{t("improverOverageDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              aria-labelledby="settings-improver-overage"
              checked={settings?.improverOverageBilling ?? false}
              disabled={settings === null || saving}
              onCheckedChange={(next) => change({ improverOverageBilling: next })}
            />
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
