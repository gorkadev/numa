/**
 * A composer action reached by typing `/` (chat-compaction S2). Only what the
 * list needs to show and filter; running it is the caller's business.
 */
export type SlashCommand = {
  /** Typed after the slash, as in `/compact`. */
  name: string
  description: string
}

/** The commands whose name starts with what was typed after the slash. */
export function matchCommands<T extends SlashCommand>(commands: readonly T[], query: string): T[] {
  const typed = query.toLowerCase()

  return commands.filter(({ name }) => name.toLowerCase().startsWith(typed))
}
