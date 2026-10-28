import type { GameSettings } from "@/lib/settings/game-preferences"

/**
 * Settings the command palette can flip in place rather than only navigate
 * to: harmless, instantly undoable switches. Anything that charges, signs out
 * or needs a confirmation flow stays out of this map on purpose.
 */
const TOGGLES = {
  "session-stats": "showSessionStats",
  "wrap-code": "wrapCodeBlocks",
} as const satisfies Record<string, keyof GameSettings>

export type ToggleKey = (typeof TOGGLES)[keyof typeof TOGGLES]

export type ToggleAction = { id: string; key: ToggleKey; next: boolean }

/** The toggles among `ids`, each offering the opposite of its saved value. */
export function toggleActionsFor(
  ids: string[],
  settings: GameSettings | null
): ToggleAction[] {
  if (!settings) return []

  return ids.flatMap((id) => {
    const key = TOGGLES[id as keyof typeof TOGGLES]
    return key ? [{ id, key, next: !settings[key] }] : []
  })
}
