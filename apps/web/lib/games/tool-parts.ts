import {
  getToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai"

import { askPlayerQuestion, type AskQuestion } from "@/lib/games/ask-player"

/**
 * The two shapes a tool call ever arrives as. A statically declared tool
 * (everything in this app) is a `ToolUIPart`; the SDK also allows a
 * `DynamicToolUIPart` for a tool set assembled at runtime, which this
 * conversation never uses but every helper here has to type-check against
 * anyway.
 */
export type ToolPart = ToolUIPart | DynamicToolUIPart

/**
 * How each tool reads in the thread, as the three verbs a marker needs: what
 * it is doing now, what it did, and what it could not do.
 *
 * Keyed by tool name rather than derived from it, because "replace_text"
 * turned into a label mechanically reads like a function call. The user is
 * watching their game get built, not reading a log.
 *
 * The failure gets its own phrase rather than " failed" tacked onto the past
 * tense, which is how "Wrote game.js failed" ended up claiming the file was
 * written in the same breath as saying it was not.
 */
export const TOOL_LABELS: Record<
  string,
  { active: string; done: string; failed: string }
> = {
  /**
   * Only ever seen while the model is still writing the question, or when the
   * call failed — once the arguments are complete and valid the call renders
   * as the questionnaire instead.
   */
  ask_player: {
    active: "Thinking it over",
    done: "Asked you a question",
    failed: "Couldn't ask you a question",
  },
  read_file: { active: "Reading", done: "Read", failed: "Couldn't read" },
  list_files: {
    active: "Looking at the game",
    done: "Looked at the game",
    failed: "Couldn't look at the game",
  },
  write_file: { active: "Writing", done: "Wrote", failed: "Couldn't write" },
  replace_text: { active: "Editing", done: "Edited", failed: "Couldn't edit" },
  delete_file: {
    active: "Deleting",
    done: "Deleted",
    failed: "Couldn't delete",
  },
}

/**
 * The tools that changed the game rather than looked at it.
 *
 * Deliberately a second copy of the set in `trigger/chat.ts` rather than an
 * import: that module is the agent task, and pulling it into a client
 * component would drag the Daytona SDK into the browser bundle. The two lists
 * answer different questions — that one decides whether to reload the preview,
 * this one decides a word in a summary — and neither breaks quietly if they
 * drift.
 */
export const MUTATING_TOOLS = new Set([
  "write_file",
  "replace_text",
  "delete_file",
])

/**
 * The file a tool call is about, when it has one.
 *
 * The input is `unknown` by design: it arrives as a partial JSON object while
 * the model is still streaming its arguments, so a `path` that is not yet a
 * string is normal rather than exceptional, and the marker simply goes without
 * until it is.
 */
export function toolPath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null

  const path = (input as { path?: unknown }).path

  return typeof path === "string" && path.length > 0 ? path : null
}

/**
 * The error message on a tool result that failed without throwing, or `null`
 * for anything else — including a result that succeeded.
 */
export function outputError(output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null

  const error = (output as { error?: unknown }).error

  return typeof error === "string" ? error : null
}

/**
 * Whether a tool call has finished, however it finished.
 *
 * Collapses the SDK's seven states into the one distinction the thread draws:
 * it is still happening, or it is not. The states beyond these — approval
 * requested, responded, denied — cannot occur here because no tool is
 * configured to require approval, but they resolve rather than crash if that
 * ever changes.
 */
export function isSettled(part: ToolPart): boolean {
  return (
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  )
}

/**
 * Why a completed tool call did not actually succeed, if it did not.
 *
 * The subtle part of this whole component. The game tools return their
 * failures as an `{ error }` result instead of throwing, so the model can read
 * the message and correct itself without the turn dying — which means a failed
 * call arrives as `output-available`, the same state as a successful one.
 * Checking only for `output-error` would render every one of those failures as
 * a tick, and quietly tell the user a file was written when it was not.
 */
export function toolError(part: ToolPart): string | null {
  if (part.state === "output-error") return part.errorText
  if (part.state === "output-denied") return "Not allowed"
  if (part.state === "output-available") return outputError(part.output)

  return null
}

/** What this call reads as right now: a verb, and the file it is about. */
export function toolLabel(part: ToolPart): string {
  const name = getToolName(part)
  const labels = TOOL_LABELS[name] ?? {
    active: name,
    done: name,
    failed: `${name} failed`,
  }
  const path = toolPath(part.input)
  const verb =
    toolError(part) !== null
      ? labels.failed
      : isSettled(part)
        ? labels.done
        : labels.active

  return `${verb}${path ? ` ${path}` : ""}`
}

/**
 * A message's parts, folded into the blocks the thread actually renders.
 *
 * The one thing this does that a `parts.map` cannot: it coalesces a run of
 * consecutive tool calls into a single block. A turn that touches a dozen
 * files produces a dozen parts, and listing them costs the thread a screen of
 * scrolling to say "it worked on the game" — while the reply that explains
 * what changed gets pushed out of view.
 *
 * Consecutive is the whole rule. A tool call that comes after the agent has
 * said something belongs to a new group, because the sentence in between is
 * what makes it a separate stretch of work rather than more of the same one.
 *
 * `ask_player` never joins a group: it is the turn handing control back, not a
 * step to summarise. A call still streaming its arguments has no question yet
 * and stays with the tools, where it reads as "thinking it over" until the
 * question is whole.
 */
export type PartBlock =
  | { kind: "text"; key: string; text: string; state?: "streaming" | "done" }
  | { kind: "tools"; key: string; parts: ToolPart[] }
  | {
      kind: "ask"
      key: string
      part: ToolPart
      question: AskQuestion
    }

export function groupParts(parts: UIMessage["parts"]): PartBlock[] {
  const blocks: PartBlock[] = []

  parts.forEach((part, index) => {
    if (isToolUIPart(part)) {
      const question = askPlayerQuestion(part)

      if (question) {
        blocks.push({ kind: "ask", key: part.toolCallId, part, question })
        return
      }

      const open = blocks.at(-1)

      if (open?.kind === "tools") {
        open.parts.push(part)
        return
      }

      blocks.push({ kind: "tools", key: part.toolCallId, parts: [part] })
      return
    }

    if (part.type !== "text") return

    blocks.push({
      kind: "text",
      key: `text-${index}`,
      text: part.text,
      state: part.state,
    })
  })

  return blocks
}
