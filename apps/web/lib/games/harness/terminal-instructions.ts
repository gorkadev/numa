import type { Instructions } from "ai"

type SystemMessage = Exclude<Instructions, string | readonly unknown[]>

/** Preserve injected system messages, adding game context only when absent. */
export function extendTerminalInstructions(
  game: Instructions,
  injected: Instructions | undefined,
  legacySystem: Instructions | undefined,
  terminal: string
): Instructions {
  const selected = injected ?? legacySystem ?? game
  const messages: SystemMessage[] = (Array.isArray(selected) ? selected : [selected]).map(
    (value) => typeof value === "string" ? { role: "system", content: value } : value
  ) as SystemMessage[]
  const gameMessages: SystemMessage[] = (Array.isArray(game) ? game : [game]).map(
    (value) => typeof value === "string" ? { role: "system", content: value } : value
  ) as SystemMessage[]

  for (const message of gameMessages) {
    if (!messages.some((existing) => existing.content === message.content)) {
      messages.push(message)
    }
  }
  messages.push({ role: "system", content: terminal })
  return messages
}
