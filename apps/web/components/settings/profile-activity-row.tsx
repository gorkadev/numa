"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
import { toast } from "@workspace/ui/components/toast"

import { SettingsRow } from "@/components/settings/settings-group"
import { ACTIVITY_METRICS, type ActivityMetric } from "@/lib/profile/activity"
import { readGameSettings, updateGameSettings } from "@/lib/settings/game-settings"

/**
 * What the profile's activity calendar counts. Stored with the other
 * `user_settings` through the same action, so it is parsed on the server like
 * any other setting; the refresh repaints the profile behind the dialog.
 */
export function ProfileActivityRow() {
  const t = useTranslations("Settings")
  const metrics = useTranslations("Profile.metrics")
  const router = useRouter()
  const [metric, setMetric] = useState<ActivityMetric | null>(null)
  const [saving, startSaving] = useTransition()

  useEffect(() => {
    readGameSettings()
      .then((settings) => setMetric(settings.profileActivityMetric))
      .catch(() => setMetric("turns"))
  }, [])

  function change(next: ActivityMetric) {
    const previous = metric
    if (!previous || next === previous) return
    setMetric(next)
    startSaving(async () => {
      try {
        const saved = await updateGameSettings({ profileActivityMetric: next })
        setMetric(saved.profileActivityMetric)
        router.refresh()
      } catch {
        setMetric(previous)
        toast.add({ type: "error", title: t("couldNotSaveProfileActivity") })
      }
    })
  }

  const items = ACTIVITY_METRICS.map((value) => ({
    value,
    label: metrics(value),
  }))

  return (
    <SettingsRow settingId="profile-activity">
      <ItemContent>
        <ItemTitle id="settings-profile-activity">
          {t("profileActivity")}
        </ItemTitle>
        <ItemDescription>{t("profileActivityDescription")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {metric === null ? (
          <Skeleton className="h-8 w-24 rounded-2xl" />
        ) : (
          <Select
            value={metric}
            onValueChange={(value) => {
              const next = ACTIVITY_METRICS.find((option) => option === value)
              if (next) change(next)
            }}
            items={items}
          >
            <SelectTrigger
              aria-labelledby="settings-profile-activity"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
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
  )
}
