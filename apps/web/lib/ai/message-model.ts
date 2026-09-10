import type { UIMessage } from "ai"
import { z } from "zod"

import { gameModelIdSchema, type GameModelId } from "./model-catalog"

/**
 * The model a turn was sent with, recorded on the message that asked for it.
 *
 * This is what makes the choice survive a reload. React state does not: the
 * picker would restart on the default and the next turn — including the one
 * that answers an `ask_player` question — would silently go to a model the
 * player never chose. The URL does not either, since a game reached from the
 * sidebar carries no query string.
 *
 * The thread does, and it is already round-tripped through `games.messages` on
 * every turn. `metadata` rides along inside that jsonb column, so this costs no
 * schema change: a model choice stays a property of the turn it was made for,
 * not of the game.
 */
const messageModelSchema = z.object({ model: gameModelIdSchema })

/**
 * What to hang on an outgoing message. A function rather than an inline object
 * so the shape has exactly one definition, checked by the schema above.
 */
export function gameModelMetadata(model: GameModelId): { model: GameModelId } {
  return { model }
}

/**
 * The model this conversation was last sent with, or `undefined` for a thread
 * that predates this — or one whose stored metadata no longer parses.
 *
 * Read backwards, because the last choice is the current one. Parsed rather
 * than cast: the column is `jsonb`, so its `UIMessage[]` type is an assertion,
 * and a model that has since left the catalog has to read as "no answer" and
 * fall back rather than reaching the agent.
 */
export function readThreadModel(
  messages: UIMessage[]
): GameModelId | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const parsed = messageModelSchema.safeParse(messages[index]?.metadata)

    if (parsed.success) return parsed.data.model
  }

  return undefined
}

/**
 * Stamps the model a turn actually ran with onto the message that turn ends on.
 *
 * This exists because `gameModelMetadata` alone cannot cover every turn. A
 * message the browser sends carries its own metadata, but the turn that answers
 * an `ask_player` question sends no message at all: `addToolOutput` advances a
 * tool part on the assistant message already in the thread and `useChat`
 * resubmits *that*, so a player who switches models and then only answers a
 * question leaves no record of the switch anywhere in the thread — the reload
 * reads the previous choice back and the picker snaps to it, even though the
 * run itself went to the model they chose.
 *
 * So the record is written where the choice is always known: the agent, which
 * receives it as `clientData` on every turn including that one. The last
 * message is the one stamped because that is where `readThreadModel` starts
 * looking, and metadata is merged rather than replaced so this stays the model
 * field's business alone.
 */
export function withThreadModel(
  messages: UIMessage[],
  model: GameModelId | undefined
): UIMessage[] {
  const last = messages.at(-1)

  if (!model || !last) return messages

  /**
   * `UIMessage["metadata"]` is `unknown`, so what is already there is widened
   * back to an object before merging: a thread whose stored metadata is a
   * primitive gets the model written rather than throwing.
   */
  const existing =
    typeof last.metadata === "object" && last.metadata !== null
      ? last.metadata
      : {}

  return [
    ...messages.slice(0, -1),
    { ...last, metadata: { ...existing, ...gameModelMetadata(model) } },
  ]
}
