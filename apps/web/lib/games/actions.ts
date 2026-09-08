"use server"

import { refresh } from "next/cache"
import { auth } from "@clerk/nextjs/server"
import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"

export type CreateGameState = { error: string } | null

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

  const title = String(formData.get("title") ?? "").trim()

  if (!title) {
    return { error: "Describe the game you want to build." }
  }

  await db.insert(games).values({ orgId, title })

  /**
   * The sidebar's list is rendered by the (app) layout, so the mutation has to
   * re-render the current tree — not just this page — for the new game to show
   * up. `refresh` re-renders the whole route, layouts included.
   */
  refresh()

  return null
}
