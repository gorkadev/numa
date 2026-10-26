import { DEFAULT_TIER_ID, isTierId, type TierId } from "@/lib/ai/model-catalog"
import type { TemplateId } from "@/lib/games/templates/catalog"

/**
 * The tier the new-game composer opens on: a valid `?tier=` (the choice made
 * on this page before a reload, or a shared link), else the player's default
 * from Settings › Game, else the app's.
 */
export function initialTierId(
  query: string | null,
  preference: TierId | null
): TierId {
  if (isTierId(query)) return query

  return preference ?? DEFAULT_TIER_ID
}

/**
 * The new-game page's query after the player picks a tier or a template, so a
 * reload or a shared link keeps the choice. Other parameters — the settings
 * dialog's, say — are kept. `?prompt=` is dropped: drafts travel through
 * sessionStorage now (see `new-game-draft.ts`), and a prompt left in the URL
 * would override the draft on the next reload.
 */
export function newGameSearch(
  current: string,
  change: { tier?: TierId; template?: TemplateId }
): string {
  const params = new URLSearchParams(current)
  params.delete("prompt")
  if (change.tier) params.set("tier", change.tier)
  if (change.template) params.set("template", change.template)

  const search = params.toString()

  return search ? `?${search}` : ""
}
