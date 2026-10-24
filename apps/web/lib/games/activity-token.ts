import { auth as triggerAuth } from "@trigger.dev/sdk"

import { activityTag } from "@/lib/games/activity"

/** Renewed on rejection by the realtime client (`components/game-activity-provider.tsx`). */
const ACTIVITY_TOKEN_EXPIRATION = "1h"

/**
 * The read-only token the sidebar's run subscription authenticates with.
 *
 * It can read nothing but runs tagged with this player's activity tag, so a
 * player can only ever watch their own games — which is why callers pass the
 * id of the session's user, never one that came from the browser. Signing is
 * local (no request to Trigger.dev, no database read), so minting it on every
 * layout render is free.
 */
export function createActivityToken(userId: string): Promise<string> {
  return triggerAuth.createPublicToken({
    scopes: { read: { tags: [activityTag(userId)] } },
    expirationTime: ACTIVITY_TOKEN_EXPIRATION,
  })
}
