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
import { Skeleton } from "@workspace/ui/components/skeleton"
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
          wrapCodeBlocks: true,
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

  /**
   * Skeletons stand in for the controls until the saved values arrive, so a
   * control never paints the default first and then jumps to the real value.
   * The labels around them are static and render straight away.
   */
  const loading = settings === null

  const tierItems = TIERS.map((tier) => ({
    value: tier.id,
    label: tiers(`${tier.id}.label`),
  }))

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title={t("newGameTitle")}>
        <SettingsRow settingId="default-tier">
          <ItemContent>
            <ItemTitle id="settings-default-tier">{t("defaultTier")}</ItemTitle>
            <ItemDescription>{t("defaultTierDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {loading ? (
              <Skeleton className="h-8 w-18 rounded-2xl" />
            ) : (
              <Select
                value={settings.defaultTierId ?? DEFAULT_TIER_ID}
                onValueChange={(value) => {
                  if (isTierId(value)) change({ defaultTierId: value })
                }}
                items={tierItems}
              >
                <SelectTrigger
                  aria-labelledby="settings-default-tier"
                  disabled={saving}
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
            )}
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title={t("chatTitle")}>
        <SettingsRow settingId="session-stats">
          <ItemContent>
            <ItemTitle id="settings-session-stats">
              {t("sessionStats")}
            </ItemTitle>
            <ItemDescription>{t("sessionStatsDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {loading ? (
              <Skeleton className="h-5 w-8 rounded-2xl" />
            ) : (
              <Switch
                aria-labelledby="settings-session-stats"
                checked={settings.showSessionStats}
                disabled={saving}
                onCheckedChange={(next) => change({ showSessionStats: next })}
              />
            )}
          </ItemActions>
        </SettingsRow>
        <SettingsRow settingId="wrap-code">
          <ItemContent>
            <ItemTitle id="settings-wrap-code">{t("wrapCode")}</ItemTitle>
            <ItemDescription>{t("wrapCodeDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {loading ? (
              <Skeleton className="h-5 w-8 rounded-2xl" />
            ) : (
              <Switch
                aria-labelledby="settings-wrap-code"
                checked={settings.wrapCodeBlocks}
                disabled={saving}
                onCheckedChange={(next) => change({ wrapCodeBlocks: next })}
              />
            )}
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup
        title={t("improverTitle")}
        description={t("improverDescription", IMPROVER_DAILY_LIMIT)}
      >
        <SettingsRow settingId="improver-overage">
          <ItemContent>
            <ItemTitle id="settings-improver-overage">
              {t("improverOverage")}
            </ItemTitle>
            <ItemDescription>{t("improverOverageDescription")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {loading ? (
              <Skeleton className="h-5 w-8 rounded-2xl" />
            ) : (
              <Switch
                aria-labelledby="settings-improver-overage"
                checked={settings.improverOverageBilling}
                disabled={saving}
                onCheckedChange={(next) =>
                  change({ improverOverageBilling: next })
                }
              />
            )}
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
