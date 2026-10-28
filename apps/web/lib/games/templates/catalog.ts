import { z } from "zod"

import type { GameDimension } from "@/lib/games/dimension"

/**
 * The starter kits available when a game is created. This catalog is safe to
 * import in client components: it contains only stable ids, versions, and UI
 * copy. Provisioning and runtime instructions belong to the server-side
 * template implementation added in GT-2.
 */
export type GameTemplate = {
  id: TemplateId
  /**
   * Bumped when a template's approved initial contents change. A game stores
   * this value with its id so its starting kit remains historically explicit.
   */
  version: number
  /**
   * Decided by us when a template is added, never inferred from its assets:
   * it picks the engine files, instructions and skills the agent receives.
   */
  dimension: GameDimension
  label: string
  tagline: string
}

/** The closed set accepted from untrusted form data. */
export const templateIdSchema = z.enum(["none", "fantasy-cards", "cube-world", "toon-shooter", "platformer", "tiny-swords", "legacy-fantasy"])

export type TemplateId = z.infer<typeof templateIdSchema>

export const TEMPLATES: readonly GameTemplate[] = [
  {
    id: "none",
    version: 1,
    dimension: "3d",
    label: "No template",
    tagline: "A blank canvas on the standard game engine.",
  },
  {
    id: "fantasy-cards",
    version: 1,
    dimension: "3d",
    label: "Fantasy Cards",
    tagline: "3D fantasy cards of spells, creatures and treasures.",
  },
  {
    id: "cube-world",
    version: 1,
    dimension: "3d",
    label: "Cube World",
    tagline: "A blocky 3D world with heroes, animals and monsters.",
  },
  {
    id: "toon-shooter",
    version: 1,
    dimension: "3d",
    label: "Toon Shooter",
    tagline: "Cartoon 3D soldiers, weapons and battlefields.",
  },
  {
    id: "platformer",
    version: 1,
    dimension: "3d",
    label: "Platformer",
    tagline: "Bright 3D platforms, coins and enemies to jump on.",
  },
  {
    id: "tiny-swords",
    version: 1,
    dimension: "2d",
    label: "Tiny Swords",
    tagline: "A 2D pixel-art kingdom seen from above.",
  },
  {
    id: "legacy-fantasy",
    version: 1,
    dimension: "2d",
    label: "Legacy Fantasy",
    tagline: "A 2D pixel-art forest adventure seen from the side.",
  },
]

export const DEFAULT_TEMPLATE_ID: TemplateId = "none"

export function isTemplateId(value: unknown): value is TemplateId {
  return templateIdSchema.safeParse(value).success
}

/**
 * The template a `?template=` link asks for, so the command palette can open
 * the home composer with a kit already chosen; anything unknown is ignored.
 */
export function templateFromQuery(value: string | null): TemplateId {
  return isTemplateId(value) ? value : DEFAULT_TEMPLATE_ID
}

export function getTemplate(id: TemplateId): GameTemplate {
  const template = TEMPLATES.find((candidate) => candidate.id === id)

  if (!template) throw new Error(`Unknown template: ${id}`)

  return template
}
