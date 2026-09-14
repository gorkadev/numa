import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai"

/**
 * The name the questionnaire gives its one field.
 *
 * The primitive is a real `<form>` and its choices are real radio inputs named
 * after the item, so the answer is read back out of `FormData` rather than
 * mirrored into React state. One field per form, and each question renders its
 * own form, so a fixed name is unambiguous.
 */
export const ASK_FIELD = "answer"

export type AskOption = { id: string; label: string; description?: string }
export type AskQuestion = { question: string; options: AskOption[] }

/**
 * The question inside an `ask_player` call, once there is enough of one to
 * put in front of the player.
 *
 * Everything here is defensive on purpose. Tool input arrives as partially
 * parsed JSON while the model streams its arguments, so a call in flight
 * legitimately has no `question` yet and an `options` array with one
 * half-written entry in it. Returning `null` until the whole thing is present
 * is what keeps a question from appearing a word at a time and an option from
 * being clickable before it has a label.
 *
 * The lower bound of two also protects the interaction rather than the types:
 * a single-option question is not a choice, and rendering it would ask the
 * player to rubber-stamp a decision the model already made.
 */
export function askPlayerQuestion(
  part: ToolUIPart | DynamicToolUIPart
): AskQuestion | null {
  if (getToolName(part) !== "ask_player") return null
  if (part.state === "output-error" || part.state === "output-denied") {
    return null
  }

  const input = part.input

  if (typeof input !== "object" || input === null) return null

  const { question, options } = input as {
    question?: unknown
    options?: unknown
  }

  if (typeof question !== "string" || question.length === 0) return null
  if (!Array.isArray(options) || options.length < 2) return null

  const parsed: AskOption[] = []

  for (const option of options) {
    if (typeof option !== "object" || option === null) return null

    const { id, label, description } = option as {
      id?: unknown
      label?: unknown
      description?: unknown
    }

    if (typeof id !== "string" || id.length === 0) return null
    if (typeof label !== "string" || label.length === 0) return null

    parsed.push({
      id,
      label,
      description: typeof description === "string" ? description : undefined,
    })
  }

  return { question, options: parsed }
}

/**
 * The option already chosen, when this question has been answered.
 *
 * Resolved back to the option the model offered rather than trusting the
 * stored output on its own: the label is echoed into the result so a replayed
 * thread reads as a conversation, but the description only ever lived in the
 * question, and that is what makes the record worth showing.
 *
 * Falling back to the raw label matters for a question whose options were
 * edited out from under an answer — the choice still happened, and dropping it
 * would silently rewrite what the player decided.
 */
export function askPlayerAnswer(
  part: ToolUIPart | DynamicToolUIPart,
  question: AskQuestion
): AskOption | null {
  if (part.state !== "output-available") return null

  const output = part.output

  if (typeof output !== "object" || output === null) return null

  const { optionId, label } = output as { optionId?: unknown; label?: unknown }

  if (typeof optionId !== "string" || optionId.length === 0) return null

  const chosen = question.options.find((option) => option.id === optionId)

  if (chosen) return chosen

  return typeof label === "string" && label.length > 0
    ? { id: optionId, label }
    : null
}
