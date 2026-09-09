"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { googleVertex } from "@ai-sdk/google-vertex"
import { auth } from "@clerk/nextjs/server"
import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { generateText } from "ai"
import { and, eq } from "drizzle-orm"

import { deleteGameSandboxes } from "@/lib/daytona/utils"

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

/**
 * Server Actions are reachable by direct POST, so an id arrives here as an
 * arbitrary string. Postgres rejects a malformed uuid with a driver-level
 * error rather than an empty result, which would surface as a 500 instead of
 * the "no such game" this app means — so the shape is checked before the id is
 * ever put in a predicate.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RenameGameState = { error: string } | null

/**
 * Renames one game.
 *
 * The `org_id` predicate rides along in the `WHERE` clause rather than being
 * checked beforehand, so a game owned by another organization updates zero rows
 * and is answered exactly like one that does not exist — the caller learns
 * nothing about ids it does not own.
 *
 * Arguments rather than a `FormData`, matching `deleteGame`: the dialog that
 * calls this already owns its field as state, so a form encoding would only be
 * something to pack and unpack on the way through.
 */
export async function renameGame(
  id: string,
  title: string
): Promise<RenameGameState> {
  const { orgId } = await auth.protect()

  if (!orgId) {
    return { error: "Select an organization before renaming a game." }
  }

  const name = title.trim().slice(0, TITLE_MAX_LENGTH)

  if (!name) {
    return { error: "A game needs a name." }
  }

  if (!UUID.test(id)) {
    return { error: "That game no longer exists." }
  }

  const [game] = await db
    .update(games)
    .set({ title: name })
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .returning({ id: games.id })

  if (!game) {
    return { error: "That game no longer exists." }
  }

  /**
   * The title is rendered in two places by two different server components —
   * the game page's header and the sidebar's list, which belongs to the (app)
   * layout — so only a whole-route re-render puts both back in sync.
   */
  refresh()

  return null
}

export type DeleteGameState = { error: string } | null

/**
 * Deletes one game: its sandbox first, then the row.
 *
 * That order is the whole point. The row is the only cheap handle this app has
 * on the sandbox, so dropping it first and failing afterwards would leave
 * billed compute running with nothing left pointing at it. Deleting the sandbox
 * first inverts the failure: the row survives, still names the sandbox, and the
 * user can simply try again.
 *
 * `viewing` says whether the caller is looking at the page for this very game,
 * which is the only thing that decides where they end up afterwards. It is a
 * flag rather than a destination on purpose: a caller-supplied URL to redirect
 * to would be an open redirect, and this only ever has one place to send
 * anyone.
 */
export async function deleteGame(
  id: string,
  { viewing = false }: { viewing?: boolean } = {}
): Promise<DeleteGameState> {
  const { orgId } = await auth.protect()

  if (!orgId) {
    return { error: "Select an organization before deleting a game." }
  }

  if (!UUID.test(id)) {
    return { error: "That game no longer exists." }
  }

  const [game] = await db
    .select({ id: games.id, sandboxId: games.sandboxId })
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .limit(1)

  if (!game) {
    return { error: "That game no longer exists." }
  }

  try {
    await deleteGameSandboxes(game.id, game.sandboxId)
  } catch {
    return {
      error: "The game's sandbox could not be deleted. Try again in a moment.",
    }
  }

  await db.delete(games).where(and(eq(games.id, id), eq(games.orgId, orgId)))

  refresh()

  /**
   * Someone on this game's own page has to be moved off it: the refresh above
   * re-renders the route they are on, and that page's `getGame` now answers
   * `notFound()`. Everyone else stays exactly where they are — deleting an old
   * game from the sidebar is no reason to throw away the page in front of you.
   *
   * `redirect` throws, so nothing below it runs in that branch.
   */
  if (viewing) redirect("/")

  return null
}
