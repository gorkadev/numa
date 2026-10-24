"use server"

import { createActivityToken } from "@/lib/games/activity-token"
import { markGameRead } from "@/lib/games/read-state"
import { requireSession } from "@/lib/session"

/**
 * Renews the sidebar's run-subscription token from the browser. The first
 * token comes from the layout, which already holds the session; this is only
 * the refresh the realtime client asks for when the token is rejected.
 */
export async function mintGameActivityToken(): Promise<string> {
  const { user } = await requireSession()

  return createActivityToken(user.id)
}

/**
 * Persists the read of a game whose turn finished while the player had it
 * open. Opening a game marks it read on the server already; this covers the
 * turn that ends afterwards, which would otherwise show as unread on the next
 * load. `markGameRead` scopes to the session's user, so an id from the browser
 * can only ever touch the caller's own game.
 */
export async function markOpenGameRead(gameId: string): Promise<void> {
  const { user } = await requireSession()

  await markGameRead(gameId, user.id)
}
