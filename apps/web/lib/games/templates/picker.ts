import { TEMPLATES, getTemplate, type GameTemplate, type TemplateId } from "./catalog"

/** Templates the picker menu lists before its "View more" entry. */
const MENU_TEMPLATE_COUNT = 3

/**
 * The templates the picker menu shows: the first three of the catalog, with
 * the selection taking the last place when it is not one of them, so the
 * current choice is always visible next to its alternatives.
 */
export function menuTemplates(selected: TemplateId): readonly GameTemplate[] {
  const first = TEMPLATES.slice(0, MENU_TEMPLATE_COUNT)
  if (first.some((template) => template.id === selected)) return first
  return [...first.slice(0, MENU_TEMPLATE_COUNT - 1), getTemplate(selected)]
}

/**
 * The templates the "View more" dialog shows, each with its preview. Starting
 * empty is left out: it has no art to show and the menu always lists it.
 */
export function dialogTemplates(): readonly GameTemplate[] {
  return TEMPLATES.filter((template) => template.id !== "none")
}

/** Lower case without accents, so "pixeles" finds "píxeles". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/**
 * The templates whose visible text contains the query. `text` returns what the
 * reader sees (translated name and description), since that is what they type.
 */
export function searchTemplates<T extends GameTemplate>(
  templates: readonly T[],
  query: string,
  text: (template: T) => string
): readonly T[] {
  const needle = normalize(query.trim())
  if (!needle) return templates
  return templates.filter((template) => normalize(text(template)).includes(needle))
}

/** The 16:9 preview a template shows in the dialog; starting empty has none. */
export function templatePreviewSrc(id: TemplateId): string | null {
  return id === "none" ? null : `/templates/${id}.webp`
}
