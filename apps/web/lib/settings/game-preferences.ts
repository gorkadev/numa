import { z } from "zod"

import { isTierId, tierIdSchema, type TierId } from "@/lib/ai/model-catalog"
import {
  DEFAULT_MESSAGE_ANIMATION,
  isMessageAnimationId,
  MESSAGE_ANIMATION_IDS,
  type MessageAnimationId,
} from "@/lib/chat/message-animations"
import { ACTIVITY_METRICS, type ActivityMetric } from "@/lib/profile/activity"

export type GameSettings = {
  improverOverageBilling: boolean
  /** The tier a new game starts on; `null` follows `DEFAULT_TIER_ID`. */
  defaultTierId: TierId | null
  /** Whether the chat footer shows the session statistics button. */
  showSessionStats: boolean
  /** Whether code blocks start with line wrapping on. */
  wrapCodeBlocks: boolean
  /** What the profile's activity heatmap counts. */
  profileActivityMetric: ActivityMetric
  /** How a sent message enters the chat; `none` for no animation. */
  messageAnimation: MessageAnimationId
}

function isActivityMetric(value: unknown): value is ActivityMetric {
  return ACTIVITY_METRICS.includes(value as ActivityMetric)
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
        wrapCodeBlocks: boolean
        profileActivityMetric?: string
        messageAnimation?: string
      }
    | undefined
): GameSettings {
  return {
    improverOverageBilling: row?.improverOverageBilling ?? false,
    defaultTierId: isTierId(row?.defaultTierId) ? row.defaultTierId : null,
    showSessionStats: row?.showSessionStats ?? true,
    wrapCodeBlocks: row?.wrapCodeBlocks ?? true,
    profileActivityMetric: isActivityMetric(row?.profileActivityMetric)
      ? row.profileActivityMetric
      : "turns",
    messageAnimation: isMessageAnimationId(row?.messageAnimation)
      ? row.messageAnimation
      : DEFAULT_MESSAGE_ANIMATION,
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
  z.strictObject({ wrapCodeBlocks: z.boolean() }),
  z.strictObject({ profileActivityMetric: z.enum(ACTIVITY_METRICS) }),
  z.strictObject({ messageAnimation: z.enum(MESSAGE_ANIMATION_IDS) }),
])

export type GameSettingsPatch = z.infer<typeof gameSettingsPatchSchema>
