"use server"

import { createActivityToken } from "@/lib/games/activity-token"
import { requireSession } from "@/lib/session"

/**
 * Renews the sidebar's run-subscription token from the browser. The first
 * token comes from the layout, which already holds the session; this is only
 * the hourly refresh.
 */
export async function mintGameActivityToken(): Promise<string> {
  const { user } = await requireSession()

  return createActivityToken(user.id)
}
