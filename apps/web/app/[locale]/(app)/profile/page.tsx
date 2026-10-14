import { getLocale, getTranslations } from "next-intl/server"

import { ProfilePage } from "@/components/profile-page"
import { requireSession } from "@/lib/session"

export default async function Page() {
  const { user } = await requireSession()
  const [t, locale] = await Promise.all([getTranslations("Profile"), getLocale()])

  return (
    <ProfilePage
      name={user.name || user.email}
      email={user.email}
      image={user.image}
      locale={locale}
      labels={{
        title: t("title"),
        sample: t("sample"),
        exampleHandle: t("exampleHandle"),
        games: t("games"),
        tokens: t("tokens"),
        days: t("days"),
        integrations: t("integrations"),
        activity: t("activity"),
        daily: t("daily"),
        weekly: t("weekly"),
        cumulative: t("cumulative"),
        less: t("less"),
        more: t("more"),
        units: t("units"),
        statistics: t("statistics"),
        activeDays: t("activeDays"),
        average: t("average"),
        peak: t("peak"),
        mostUsed: t("mostUsed"),
        exampleIntegration: t("exampleIntegration"),
        notConnected: t("notConnected"),
      }}
    />
  )
}
