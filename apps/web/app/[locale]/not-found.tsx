import Link from "next/link"
import { Compass01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { getTranslations } from "next-intl/server"

import { StateScreen } from "@/components/state-screen"

/**
 * What `notFound()` renders anywhere under the locale layout: a game that is
 * not the reader's (or no longer exists), and any URL no route matches,
 * through `[...rest]/page.tsx`.
 */
export default async function NotFound() {
  const t = await getTranslations("NotFound")

  return (
    <StateScreen
      icon={Compass01Icon}
      title={t("title")}
      description={t("description")}
      action={
        <Button nativeButton={false} render={<Link href="/" />}>
          {t("home")}
        </Button>
      }
    />
  )
}
