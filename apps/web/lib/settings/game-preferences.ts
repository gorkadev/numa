import { z } from "zod"

import { isTierId, tierIdSchema, type TierId } from "@/lib/ai/model-catalog"

export type GameSettings = {
  improverOverageBilling: boolean
  /** The tier a new game starts on; `null` follows `DEFAULT_TIER_ID`. */
  defaultTierId: TierId | null
  /** Whether the chat footer shows the session statistics button. */
  showSessionStats: boolean
}

/**
 * A `user_settings` row as the player sees it. No row reads the schema's
 * defaults, and a stored tier that is no longer in the catalog reads as no
 * preference rather than as a tier that cannot run.
 */
export function gameSettingsOf(
  row:
    | {
        improverOverageBilling: boolean
        defaultTierId: string | null
        showSessionStats: boolean
      }
    | undefined
): GameSettings {
  return {
    improverOverageBilling: row?.improverOverageBilling ?? false,
    defaultTierId: isTierId(row?.defaultTierId) ? row.defaultTierId : null,
    showSessionStats: row?.showSessionStats ?? true,
  }
}

/**
 * One setting per change, parsed because it arrives from the browser — an
 * action is a public endpoint. A tier can be chosen but not cleared back to
 * `null`: the selector shows the app default as a tier, not as a fourth
 * option (see odd/tasks/game-settings.md, L2).
 */
export const gameSettingsPatchSchema = z.union([
  z.strictObject({ improverOverageBilling: z.boolean() }),
  z.strictObject({ defaultTierId: tierIdSchema }),
  z.strictObject({ showSessionStats: z.boolean() }),
])

export type GameSettingsPatch = z.infer<typeof gameSettingsPatchSchema>
