"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { googleVertex } from "@ai-sdk/google-vertex"
import { auth } from "@clerk/nextjs/server"
import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { generateText } from "ai"

export type CreateGameState = { error: string } | null

/**
 * Titles are short, disposable labels for the sidebar — no reasoning required —
 * so the cheapest, fastest model in the family handles them rather than the one
 * that answers the chat.
 */
const TITLE_MODEL = "gemini-3.5-flash-lite"

const TITLE_MAX_LENGTH = 60

/**
 * Derives a sidebar label from the prompt that started the game. Falls back to
 * the truncated prompt: a game that exists under an awkward name is a better
 * outcome than a creation that fails because the model was unreachable.
 */
async function generateTitle(prompt: string): Promise<string> {
  const fallback = prompt.slice(0, TITLE_MAX_LENGTH).trim()

  try {
    const { text } = await generateText({
      model: googleVertex(TITLE_MODEL),
      instructions:
        "You name games from the prompt that created them. Reply with the " +
        "title alone: 2 to 5 words, title case, no quotes, no punctuation at " +
        "the end, no explanation.",
      prompt,
    })

    /**
     * Small models still occasionally wrap the answer in quotes or run long,
     * and the value goes straight into the UI, so it is trimmed rather than
     * trusted.
     */
    const title = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .slice(0, TITLE_MAX_LENGTH)
      .trim()

    return title || fallback
  } catch {
    return fallback
  }
}

/**
 * Server Actions are reachable by direct POST, not only through the composer,
 * so authentication and the org scope are re-established here rather than
 * trusted from the caller.
 */
export async function createGame(
  _prevState: CreateGameState,
  formData: FormData
): Promise<CreateGameState> {
  const { orgId } = await auth.protect()

  if (!orgId) {
    return { error: "Select an organization before creating a game." }
  }

  const prompt = String(formData.get("prompt") ?? "").trim()

  if (!prompt) {
    return { error: "Describe the game you want to build." }
  }

  const title = await generateTitle(prompt)

  const [game] = await db
    .insert(games)
    .values({ orgId, title })
    .returning({ id: games.id })

  if (!game) {
    return { error: "The game could not be created. Try again." }
  }

  /**
   * The sidebar's list is rendered by the (app) layout, so the mutation has to
   * re-render the current tree — not just this page — for the new game to show
   * up. `refresh` re-renders the whole route, layouts included, and runs before
   * the redirect so the destination is rendered against fresh data.
   */
  refresh()

  /**
   * The prompt travels to the new game in the query string rather than being
   * written to the thread here: the chat agent is what turns a user message
   * into a turn — it appends, calls the model and persists both sides — so
   * seeding the row directly would create a message the assistant never
   * answers. The thread strips the parameter once it has sent it.
   *
   * `redirect` throws a control-flow exception, so nothing below it runs.
   */
  redirect(`/games/${game.id}?prompt=${encodeURIComponent(prompt)}`)
}
