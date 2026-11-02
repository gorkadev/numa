import { generateId, generateText } from "ai"
import type { LanguageModelUsage, ModelMessage, UIMessage } from "ai"

import type { ContextUsage } from "./context-usage"

/**
 * Compaction keeps the orchestrator inside its context window on a long game.
 *
 * The stored thread is never shortened: the player keeps every message. What
 * changes is what the agent receives. A compaction appends a marker message to
 * the thread carrying a summary of everything before it, and from then on the
 * agent gets that summary plus the messages after the latest marker.
 *
 * It lives in the thread, not beside it, because `hydrateMessages` rebuilds the
 * model's history from the stored thread on every turn: the SDK's own
 * `compaction` result would be thrown away by the next turn.
 */

/** The marker's only part. Persisted, unlike the transient `data-compacting` status. */
export const COMPACTION_PART = "data-compaction"

/** Transient status sent while a summary is being written. */
export const COMPACTING_PART = "data-compacting"

/** Share of the context window at which a finished turn compacts the thread. */
export const AUTO_COMPACT_RATIO = 0.8

export type CompactionTrigger = "auto" | "manual"

export type CompactionData = {
  summary: string
  trigger: CompactionTrigger
  /** The context reading that led to it, and the window it was read against. */
  tokens: number
  window: number
}

/**
 * Whether the orchestrator's latest reading has reached the threshold. The
 * reading is its last step's input, so the next turn starts at least that full.
 */
export function shouldAutoCompact(context: ContextUsage | undefined): boolean {
  if (!context || context.window <= 0) return false

  return context.tokens >= context.window * AUTO_COMPACT_RATIO
}

export function compactionMarker(data: CompactionData): UIMessage {
  return {
    id: generateId(),
    role: "assistant",
    parts: [{ type: COMPACTION_PART, data }],
  }
}

export function readCompaction(message: UIMessage): CompactionData | null {
  if (message.role !== "assistant") return null

  const part = message.parts.find((candidate) => candidate.type === COMPACTION_PART)

  if (!part || !("data" in part)) return null

  const data = part.data as Partial<Record<keyof CompactionData, unknown>> | null

  if (
    typeof data !== "object" ||
    data === null ||
    typeof data.summary !== "string" ||
    (data.trigger !== "auto" && data.trigger !== "manual") ||
    typeof data.tokens !== "number" ||
    typeof data.window !== "number"
  ) {
    return null
  }

  return { summary: data.summary, trigger: data.trigger, tokens: data.tokens, window: data.window }
}

export function isCompactionMarker(message: UIMessage): boolean {
  return readCompaction(message) !== null
}

export function latestCompaction(
  messages: UIMessage[]
): { index: number; data: CompactionData } | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const data = readCompaction(messages[index]!)

    if (data) return { index, data }
  }

  return null
}

function summaryText(summary: string): string {
  return (
    "[Summary of the earlier conversation. The turns before this point were " +
    "compacted to save context; the game's files in the sandbox are current.]\n\n" +
    summary
  )
}

/**
 * Puts the summary ahead of `tail`. It opens the first user message rather than
 * standing as a message of its own, so the history keeps alternating roles.
 */
export function withSummary(summary: string, tail: ModelMessage[]): ModelMessage[] {
  const text = summaryText(summary)
  const [first, ...rest] = tail

  if (first?.role !== "user") {
    return [{ role: "user", content: text }, ...tail]
  }

  const content =
    typeof first.content === "string"
      ? [{ type: "text" as const, text: first.content }]
      : first.content

  return [{ ...first, content: [{ type: "text", text }, ...content] }, ...rest]
}

/**
 * What the agent receives: `full` when nothing was compacted, otherwise the
 * latest summary plus the messages after its marker. `convert` must be the
 * conversion the SDK applies itself (`convertToModelMessages` with the turn's
 * tools), so the tail reads exactly as it would have.
 */
export async function agentHistory(
  messages: UIMessage[],
  full: ModelMessage[],
  convert: (messages: UIMessage[]) => Promise<ModelMessage[]>
): Promise<ModelMessage[]> {
  const latest = latestCompaction(messages)

  if (!latest) return full

  return withSummary(latest.data.summary, await convert(messages.slice(latest.index + 1)))
}

/**
 * The history with every attached file replaced by a note naming it. Stored
 * attachments are references only `run`'s `resolveAttachments` can read, and a
 * summary needs to know a file was shared, not what it held.
 */
export function withoutFileParts(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || typeof message.content === "string") return message
    if (!message.content.some((part) => part.type === "file")) return message

    return {
      ...message,
      content: message.content.map((part) =>
        part.type === "file"
          ? { type: "text" as const, text: `[The player attached ${part.filename ?? "a file"}]` }
          : part
      ),
    }
  })
}

const COMPACTION_INSTRUCTIONS = [
  "You compact the history of a game-building chat between a player and an AI agent that builds the game.",
  "Write a summary the agent will read instead of the conversation, so it can keep working as if it remembered everything that matters.",
  "Keep: what the player asked for and every preference or correction they gave, quoted when the wording matters; the decisions taken and why; the current state of the game and which files hold what; what was tried and failed; anything unfinished or promised.",
  "Leave out tool output that only mattered at the time, file contents (the files themselves are kept in the sandbox), and pleasantries.",
  "If the history opens with an earlier summary, fold it in: the result replaces it.",
  "Write in the language the player uses. Plain prose and short lists, no preamble.",
].join("\n")

/**
 * Writes the summary. `history` is what the agent would receive now, so a
 * second compaction summarizes the first summary plus what followed it and
 * never needs the whole thread to fit in one request.
 */
export async function summarizeHistory({
  history,
  model,
  providerOptions,
  abortSignal,
}: {
  history: ModelMessage[]
  model: Parameters<typeof generateText>[0]["model"]
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"]
  abortSignal?: AbortSignal
}): Promise<{ summary: string; usage: LanguageModelUsage }> {
  const { text, usage } = await generateText({
    model,
    providerOptions,
    instructions: COMPACTION_INSTRUCTIONS,
    messages: [
      ...withoutFileParts(history),
      { role: "user", content: "Write the summary of the conversation above now." },
    ],
    abortSignal,
  })

  return { summary: text.trim(), usage }
}
