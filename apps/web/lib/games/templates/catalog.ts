import { z } from "zod"

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
  label: string
  tagline: string
}

/** The closed set accepted from untrusted form data. */
export const templateIdSchema = z.enum(["none", "fantasy-cards", "cube-world"])

export type TemplateId = z.infer<typeof templateIdSchema>

export const TEMPLATES: readonly GameTemplate[] = [
  {
    id: "none",
    version: 1,
    label: "No template",
    tagline: "Start from the standard game runtime.",
  },
  {
    id: "fantasy-cards",
    version: 1,
    label: "Fantasy Cards",
    tagline: "Start with a fantasy card game foundation.",
  },
  {
    id: "cube-world",
    version: 1,
    label: "Cube World",
    tagline: "Start with a small 3D adventure kit; the local pack has no bundled license evidence.",
  },
]

export const DEFAULT_TEMPLATE_ID: TemplateId = "none"

export function isTemplateId(value: unknown): value is TemplateId {
  return templateIdSchema.safeParse(value).success
}

export function getTemplate(id: TemplateId): GameTemplate {
  const template = TEMPLATES.find((candidate) => candidate.id === id)

  if (!template) throw new Error(`Unknown template: ${id}`)

  return template
}
