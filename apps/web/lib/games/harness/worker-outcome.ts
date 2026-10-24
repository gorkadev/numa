import type { SubagentEnvelope } from "./envelope"

/**
 * A worker that reports `done` without having written a single file it owns.
 *
 * Every dispatched task owns at least one file, so finishing without touching
 * any of them is never a real completion. It is what an empty provider
 * response looks like from here: the model stops (`finishReason: "stop"`,
 * zero output tokens) right before the large `write_file` it was building,
 * and the runner can only read that as a normal finish.
 */
export function wroteNothing(result: {
  envelope: SubagentEnvelope
  edits: readonly string[]
}): boolean {
  return result.envelope.status === "done" && result.edits.length === 0
}

/** The second attempt's prompt: the same task, plus why it is running again. */
export function retryPromptAfterNoWrites(prompt: string, owns: readonly string[]): string {
  return `${prompt}

## Retry
Your previous attempt ended without writing any of your files (${owns.join(", ")}). Do the task now: write or edit those files. If a file is large, write it in smaller pieces — a first write_file, then replace_text — rather than one very long call.`
}

/** What the orchestrator sees when the retry wrote nothing either: not a completion. */
export function noWritesEnvelope(
  envelope: SubagentEnvelope,
  owns: readonly string[]
): SubagentEnvelope {
  const said = envelope.summary.trim()
  return {
    ...envelope,
    status: "partial",
    summary: `Finished twice without writing any of its files (${owns.join(", ")}); nothing changed.${said ? ` Its own report: ${said}` : ""}`,
  }
}
