"use server"

import { getGame } from "@/lib/games/queries"
import { readThreadPage } from "@/lib/games/thread"

/**
 * The page of history ending just before `before`. `getGame` folds the caller's
 * user id into the lookup, so another player's game reads as missing.
 */
export async function loadEarlierMessages(gameId: string, before: number) {
  if (!Number.isInteger(before) || before < 0) throw new Error("Invalid cursor")

  const game = await getGame(gameId)

  if (!game) throw new Error("Not found")

  return readThreadPage(gameId, before)
}
