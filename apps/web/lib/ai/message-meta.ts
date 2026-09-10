import type { LanguageModelUsage, UIMessage } from "ai"
import { z } from "zod"

import { turnCreditCost, turnUsageTokens } from "./pricing"
import type { ModelEntryId } from "./model-registry"

/**
 * What a turn is worth reporting about itself, recorded on the message that
 * turn ended on: when it happened, what it spent, and what that cost.
 *
 * It rides in `metadata` for the same reason the model choice does — see
 * `./message-model.ts`. `metadata` is already round-tripped through the
 * `games.messages` jsonb column on every turn, so none of this costs a schema
 * change, and none of it reaches the model: `convertToModelMessages` drops
 * metadata on the way into the provider, which is what keeps a cost report
 * from becoming part of the conversation the agent reads back.
 *
 * Deliberately NOT the `data-turn-credits` stream part. That one is transient
 * and must stay that way — it moves the sidebar's counter the instant a turn
 * ends and would replay the same deduction on every reload if it were kept.
 * This is the durable half of the same fact: not "your balance just moved",
 * but "this message cost that".
 */
const messageMetaSchema = z.object({
  /**
   * Milliseconds since the epoch. A number rather than an ISO string because
   * it survives the jsonb round trip as itself, and the browser is the only
   * thing that ever formats it — in the reader's own timezone, which is the
   * only timezone that means anything here.
   */
  sentAt: z.number().optional(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      cached: z.number(),
      reasoning: z.number(),
    })
    .optional(),
  credits: z.number().optional(),
})

export type MessageMeta = z.infer<typeof messageMetaSchema>

/**
 * The stamp a message the browser sends carries with it.
 *
 * The client's clock, not the server's, and that is the honest choice: this is
 * the moment the player pressed send, which is the moment they will recognise
 * when they read it back. A server timestamp would be a few hundred
 * milliseconds later and, on a resumed turn, could be minutes later.
 */
export function sentAtMetadata(): { sentAt: number } {
  return { sentAt: Date.now() }
}

/**
 * What a message is willing to say about itself, or an empty object for one
 * that predates any of this.
 *
 * Parsed rather than cast, exactly as `readThreadTier` is: the column is
 * `jsonb`, so `UIMessage["metadata"]` being `unknown` is the truth and a
 * thread written by an older build legitimately has nothing here. Everything
 * downstream renders what is present and omits what is not — a missing
 * timestamp shows no time rather than the epoch.
 */
export function readMessageMeta(message: UIMessage): MessageMeta {
  const parsed = messageMetaSchema.safeParse(message.metadata)

  return parsed.success ? parsed.data : {}
}

/**
 * Records what the finished turn spent, on the message it ended on.
 *
 * Only ever the assistant's message. The last message at the end of a turn is
 * normally the reply, but a turn can be handed back with the player's own
 * message still last — and hanging a token count on something the player wrote
 * would read as though their sentence cost credits.
 *
 * Tokens ACCUMULATE rather than overwrite, because one assistant message can
 * span more than one turn: `ask_player` suspends the run mid-message, and the
 * turn that resumes writes into the same message it asked from. Two turns, one
 * message, and both of them cost real money — so the number on the message is
 * their sum, not whichever one finished last.
 *
 * `sentAt` does the opposite and keeps the first stamp for the same reason: a
 * message that was written across a question should not jump forward in the
 * thread's clock when the answer comes back.
 */
export function withTurnMeta(
  messages: UIMessage[],
  {
    modelId,
    usage,
  }: { modelId: ModelEntryId; usage: LanguageModelUsage | undefined }
): UIMessage[] {
  const last = messages.at(-1)

  if (!last || last.role !== "assistant") return messages

  const existing = readMessageMeta(last)
  const tokens = usage ? turnUsageTokens(usage) : undefined

  const meta: MessageMeta = {
    sentAt: existing.sentAt ?? Date.now(),
    tokens: tokens
      ? {
          input: (existing.tokens?.input ?? 0) + tokens.inputTokens,
          output: (existing.tokens?.output ?? 0) + tokens.outputTokens,
          cached: (existing.tokens?.cached ?? 0) + tokens.cachedInputTokens,
          reasoning:
            (existing.tokens?.reasoning ?? 0) + tokens.reasoningTokens,
        }
      : existing.tokens,
    credits: usage
      ? (existing.credits ?? 0) + turnCreditCost({ modelId, usage })
      : existing.credits,
  }

  /**
   * Merged into whatever is already there rather than replacing it — the model
   * choice lives in this same object and is written by a different function.
   */
  const base =
    typeof last.metadata === "object" && last.metadata !== null
      ? last.metadata
      : {}

  return [...messages.slice(0, -1), { ...last, metadata: { ...base, ...meta } }]
}
