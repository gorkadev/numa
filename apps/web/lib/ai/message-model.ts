import type { UIMessage } from "ai"
import { z } from "zod"

import {
  LEGACY_MODEL_TIER,
  legacyModelIdSchema,
  tierIdSchema,
  type TierId,
} from "./model-catalog"

/**
 * The tier a turn was sent with, recorded on the message that asked for it.
 *
 * This is what makes the choice survive a reload. React state does not: the
 * picker would restart on the default and the next turn — including the one
 * that answers an `ask_player` question — would silently go to a tier the
 * player never chose. The URL does not either, since a game reached from the
 * sidebar carries no query string.
 *
 * The thread does, and it is already round-tripped through `games.messages` on
 * every turn. `metadata` rides along inside that jsonb column, so this costs no
 * schema change: a tier choice stays a property of the turn it was made for,
 * not of the game.
 */
const tierMetadataSchema = z.object({ tier: tierIdSchema })

/**
 * A thread written before tiers existed recorded a raw model id instead. Read
 * against this schema only as a fallback, one message at a time, by
 * `readThreadTier` below — never trusted on its own, because a legacy record is
 * only meaningful once mapped through `LEGACY_MODEL_TIER`.
 */
const legacyModelMetadataSchema = z.object({ model: legacyModelIdSchema })

/**
 * What to hang on an outgoing message. A function rather than an inline object
 * so the shape has exactly one definition, checked by the schema above.
 */
export function tierMetadata(tier: TierId): { tier: TierId } {
  return { tier }
}

/**
 * The tier this conversation was last sent with, or `undefined` for a thread
 * that predates this — or one whose stored metadata no longer parses.
 *
 * Read backwards, because the last choice is the current one. Each message is
 * checked against two shapes in order: the current `{ tier }` record, and —
 * only when that does not parse — the legacy `{ model }` record a thread
 * written before tiers existed carries, mapped through `LEGACY_MODEL_TIER`.
 * Neither is cast: the column is `jsonb`, so a tier or model that has since
 * left its catalog has to read as "no answer" and fall back rather than
 * reaching the agent.
 */
export function readThreadTier(messages: UIMessage[]): TierId | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const metadata = messages[index]?.metadata

    const tier = tierMetadataSchema.safeParse(metadata)

    if (tier.success) return tier.data.tier

    const legacy = legacyModelMetadataSchema.safeParse(metadata)

    if (legacy.success) return LEGACY_MODEL_TIER[legacy.data.model]
  }

  return undefined
}

/**
 * Stamps the tier a turn actually ran with onto the message that turn ends on.
 *
 * This exists because `tierMetadata` alone cannot cover every turn. A message
 * the browser sends carries its own metadata, but the turn that answers an
 * `ask_player` question sends no message at all: `addToolOutput` advances a
 * tool part on the assistant message already in the thread and `useChat`
 * resubmits *that*, so a player who switches tiers and then only answers a
 * question leaves no record of the switch anywhere in the thread — the reload
 * reads the previous choice back and the picker snaps to it, even though the
 * run itself went to the tier they chose.
 *
 * So the record is written where the choice is always known: the agent, which
 * receives it as `clientData` on every turn including that one. The last
 * message is the one stamped because that is where `readThreadTier` starts
 * looking, and metadata is merged rather than replaced so this stays the tier
 * field's business alone.
 */
export function withThreadTier(
  messages: UIMessage[],
  tier: TierId | undefined
): UIMessage[] {
  const last = messages.at(-1)

  if (!tier || !last) return messages

  /**
   * `UIMessage["metadata"]` is `unknown`, so what is already there is widened
   * back to an object before merging: a thread whose stored metadata is a
   * primitive gets the tier written rather than throwing.
   */
  const existing =
    typeof last.metadata === "object" && last.metadata !== null
      ? last.metadata
      : {}

  return [
    ...messages.slice(0, -1),
    { ...last, metadata: { ...existing, ...tierMetadata(tier) } },
  ]
}
