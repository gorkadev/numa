import { getLocale } from "next-intl/server"

import { ProfilePage } from "@/components/profile-page"
import { readProfileActivity } from "@/lib/profile/activity-queries"
import { readGameSettings } from "@/lib/settings/game-settings"
import { requireSession } from "@/lib/session"

export default async function Page() {
  const { user } = await requireSession()
  const [activity, settings, locale] = await Promise.all([
    readProfileActivity(user.id),
    readGameSettings(),
    getLocale(),
  ])

  return (
    <ProfilePage
      name={user.name || user.email}
      email={user.email}
      image={user.image}
      username={user.username ?? null}
      locale={locale}
      metric={settings.profileActivityMetric}
      activity={activity}
    />
  )
}
