"use server"

import { db } from "@workspace/db"
import { userSettings } from "@workspace/db/schema"
import { eq } from "drizzle-orm"

import {
  gameSettingsOf,
  gameSettingsPatchSchema,
  type GameSettings,
} from "@/lib/settings/game-preferences"
import { requireSession } from "@/lib/session"

async function readSettingsRow(userId: string) {
  const [row] = await db
    .select({
      improverOverageBilling: userSettings.improverOverageBilling,
      defaultTierId: userSettings.defaultTierId,
      showSessionStats: userSettings.showSessionStats,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  return row
}

/** A user with no row yet reads the schema's defaults. */
export async function readGameSettings(): Promise<GameSettings> {
  const { user } = await requireSession()

  return gameSettingsOf(await readSettingsRow(user.id))
}

/**
 * Upserts one setting. The value arrives from the browser, so it is parsed —
 * an action is a public endpoint, and only a real boolean may turn on a charge.
 */
export async function updateGameSettings(patch: unknown): Promise<GameSettings> {
  const { user } = await requireSession()
  const values = gameSettingsPatchSchema.parse(patch)

  await db
    .insert(userSettings)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...values, updatedAt: new Date() },
    })

  return gameSettingsOf(await readSettingsRow(user.id))
}
