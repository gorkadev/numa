"use server"

import { db } from "@workspace/db"
import { userSettings } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { requireSession } from "@/lib/session"

export type GameSettings = {
  improverOverageBilling: boolean
}

/** A user with no row yet reads the schema's defaults. */
export async function readGameSettings(): Promise<GameSettings> {
  const { user } = await requireSession()
  const [row] = await db
    .select({ improverOverageBilling: userSettings.improverOverageBilling })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1)

  return { improverOverageBilling: row?.improverOverageBilling ?? false }
}

/**
 * Upserts the opt-in. The value arrives from the browser, so it is parsed —
 * an action is a public endpoint, and only a real boolean may turn on a charge.
 */
export async function setImproverOverageBilling(enabled: unknown): Promise<GameSettings> {
  const { user } = await requireSession()
  const value = z.boolean().parse(enabled)

  await db
    .insert(userSettings)
    .values({ userId: user.id, improverOverageBilling: value })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { improverOverageBilling: value, updatedAt: new Date() },
    })

  return { improverOverageBilling: value }
}
