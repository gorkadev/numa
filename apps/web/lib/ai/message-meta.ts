import type { UIMessage, UIMessageChunk } from "ai"
import { z } from "zod"

import { addSpeed, type GenerationSpeed } from "@/lib/games/generation-speed"
import { addTiming, type StepTimingTotals } from "@/lib/games/step-timing"

import type { TurnCost } from "./pricing"

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
const tokensSchema = z.object({
  input: z.number(),
  output: z.number(),
  cached: z.number(),
  reasoning: z.number(),
})

const timingSchema = z.object({
  llmMs: z.number(),
  toolMs: z.number(),
  ttftMs: z.number(),
  ttftSteps: z.number(),
})

/**
 * The turn still running, as far as it has got: what it has spent so far, sent
 * after each finished step (`liveTurnChunk`) so the usage popover moves while a
 * build runs instead of jumping at the end. Provisional — only ever held by the
 * browser: the final receipt clears it (`live: null`) and `withTurnMeta` never
 * stores it, so it cannot be counted twice.
 */
const liveTurnSchema = z.object({
  tokens: tokensSchema,
  credits: z.number(),
  speed: z.object({ tokens: z.number(), ms: z.number() }).optional(),
  steps: z.number().optional(),
  timing: timingSchema.optional(),
})

const messageMetaSchema = z.object({
  /**
   * Milliseconds since the epoch. A number rather than an ISO string because
   * it survives the jsonb round trip as itself, and the browser is the only
   * thing that ever formats it — in the reader's own timezone, which is the
   * only timezone that means anything here.
   */
  sentAt: z.number().optional(),
  tokens: tokensSchema.optional(),
  credits: z.number().optional(),
  /**
   * How full the orchestrator's window was at the turn's last step. Optional:
   * a reply written before this existed carries none, and the footer simply
   * shows no ring for it.
   */
  context: z
    .object({
      tokens: z.number(),
      window: z.number(),
      cached: z.number().optional(),
    })
    .optional(),
  /**
   * Orchestrator output tokens and the generation time they took, summed over
   * the turn's steps. Optional: a reply written before this existed carries
   * none and simply adds nothing to the session's speed.
   */
  speed: z.object({ tokens: z.number(), ms: z.number() }).optional(),
  /**
   * How many steps the orchestrator took for the turn. Optional for the same
   * reason as `speed`: older replies carry none and add nothing to the total.
   */
  steps: z.number().optional(),
  /** Model, tool and first-output time for the turn; optional like `speed`. */
  timing: timingSchema.optional(),
  live: liveTurnSchema.nullable().optional(),
})

type StoredMeta = z.infer<typeof messageMetaSchema>

/** A reply's receipt as the UI reads it: a running turn's provisional spend already folded in. */
export type MessageMeta = Omit<StoredMeta, "live"> & {
  /** Set while the turn behind this reply is still running and its numbers can still grow. */
  provisional?: true
}

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
/** What the reply durably carries, without a running turn's provisional spend. */
function readStoredMeta(message: UIMessage): Omit<StoredMeta, "live"> {
  const parsed = messageMetaSchema.safeParse(message.metadata)

  if (!parsed.success) return {}

  const { live: _live, ...stored } = parsed.data
  return stored
}

export function readMessageMeta(message: UIMessage): MessageMeta {
  const parsed = messageMetaSchema.safeParse(message.metadata)

  if (!parsed.success) return {}

  const { live, ...stored } = parsed.data

  if (!live) return stored

  return {
    ...stored,
    tokens: {
      input: (stored.tokens?.input ?? 0) + live.tokens.input,
      output: (stored.tokens?.output ?? 0) + live.tokens.output,
      cached: (stored.tokens?.cached ?? 0) + live.tokens.cached,
      reasoning: (stored.tokens?.reasoning ?? 0) + live.tokens.reasoning,
    },
    credits: (stored.credits ?? 0) + live.credits,
    speed:
      live.speed && stored.speed
        ? addSpeed(stored.speed, live.speed)
        : (live.speed ?? stored.speed),
    steps:
      live.steps === undefined
        ? stored.steps
        : (stored.steps ?? 0) + live.steps,
    timing:
      live.timing && stored.timing
        ? addTiming(stored.timing, live.timing)
        : (live.timing ?? stored.timing),
    provisional: true,
  }
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
 *
 * `cost` is the FULL turn's price — the orchestrator plus every dispatched
 * sub-agent, already summed by `priceTurn` — never the orchestrator's usage
 * alone. A turn that priced nothing (no ledger entries at all) carries zeros,
 * which the accumulation below adds as a no-op, so a message this function
 * never really priced anything for is left exactly as it was.
 */
export function withTurnMeta(
  messages: UIMessage[],
  cost: TurnCost,
  context?: MessageMeta["context"],
  speed?: GenerationSpeed,
  steps?: number,
  timing?: StepTimingTotals
): UIMessage[] {
  const last = messages.at(-1)

  if (!last || last.role !== "assistant") return messages

  const existing = readStoredMeta(last)

  const meta: MessageMeta = {
    sentAt: existing.sentAt ?? Date.now(),
    tokens: {
      input: (existing.tokens?.input ?? 0) + cost.tokens.inputTokens,
      output: (existing.tokens?.output ?? 0) + cost.tokens.outputTokens,
      cached: (existing.tokens?.cached ?? 0) + cost.tokens.cachedInputTokens,
      reasoning:
        (existing.tokens?.reasoning ?? 0) + cost.tokens.reasoningTokens,
    },
    credits: (existing.credits ?? 0) + cost.credits,
    /**
     * Replaces rather than accumulates, unlike the token counts: it is a
     * reading of the window at the latest step, so the newest turn's value is
     * the only true one. A turn that took no reading keeps the previous one.
     */
    context: context ?? existing.context,
    /**
     * Accumulates like the token counts: it is a total of work done, so a
     * message that spans two turns has both.
     */
    speed:
      speed && existing.speed
        ? addSpeed(existing.speed, speed)
        : (speed ?? existing.speed),
    steps:
      steps === undefined ? existing.steps : (existing.steps ?? 0) + steps,
    timing:
      timing && existing.timing
        ? addTiming(existing.timing, timing)
        : (timing ?? existing.timing),
  }

  /**
   * Merged into whatever is already there rather than replacing it — the model
   * choice lives in this same object and is written by a different function.
   */
  const { live: _live, ...base } =
    typeof last.metadata === "object" && last.metadata !== null
      ? (last.metadata as Record<string, unknown>)
      : {}

  return [...messages.slice(0, -1), { ...last, metadata: { ...base, ...meta } }]
}

/**
 * The same receipt `withTurnMeta` persists, as a stream chunk.
 *
 * The persisted copy is written after the stream has closed, so without this
 * the browser's message has no receipt until the thread is reloaded: no token
 * footer, no per-reply popover. The `message-metadata` chunk is merged into
 * the in-flight reply by the client as it arrives.
 *
 * Built by running `withTurnMeta` and reading back what it stamped, never by
 * assembling the fields a second time, so the live value and the stored one
 * cannot drift apart. `null` when there is no assistant reply to put it on.
 */
export function turnMetaChunk(
  message: UIMessage | undefined,
  cost: TurnCost,
  context?: MessageMeta["context"],
  speed?: GenerationSpeed,
  steps?: number,
  timing?: StepTimingTotals
): UIMessageChunk | null {
  if (!message || message.role !== "assistant") return null

  const [stamped] = withTurnMeta([message], cost, context, speed, steps, timing)

  return {
    type: "message-metadata",
    // `null`, not omitted: the browser merges metadata chunks and skips undefined keys.
    messageMetadata: { ...(stamped?.metadata as object), live: null },
  }
}

/**
 * The provisional receipt for the turn still running: what it has cost so
 * far, as `live`, which `readMessageMeta` adds on top of what the reply already
 * carries. Sent after finished steps while the turn runs; the final receipt
 * (`turnMetaChunk`) clears it.
 */
export function liveTurnChunk(
  cost: TurnCost,
  speed?: GenerationSpeed,
  steps?: number,
  timing?: StepTimingTotals
): UIMessageChunk {
  return {
    type: "message-metadata",
    messageMetadata: {
      live: {
        tokens: {
          input: cost.tokens.inputTokens,
          output: cost.tokens.outputTokens,
          cached: cost.tokens.cachedInputTokens,
          reasoning: cost.tokens.reasoningTokens,
        },
        credits: cost.credits,
        speed,
        steps,
        timing,
      },
    },
  }
}

/**
 * The thread with every provisional receipt removed, or the same array when
 * there is none. Run once a turn's stream has ended, however it ended: a
 * stopped turn never receives the final receipt that would clear `live`, and
 * the last provisional chunk can land after that receipt — each one its own
 * write, in no guaranteed order — and would otherwise be counted on top of it.
 */
export function withoutLiveReceipts(messages: UIMessage[]): UIMessage[] {
  let changed = false

  const next = messages.map((message) => {
    const metadata = message.metadata as Record<string, unknown> | undefined
    if (message.role !== "assistant" || !metadata?.live) return message

    changed = true
    const { live: _live, ...rest } = metadata
    return { ...message, metadata: rest }
  })

  return changed ? next : messages
}
