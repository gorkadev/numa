export type TemplateInventoryModel = {
  id: string
  path: string
  category?: string
  bounds?: { min: readonly number[]; max: readonly number[] }
  animations?: readonly { name: string; category: string }[]
}

/** Complete, searchable manifest inventory; only presentation order changes. */
export function renderTemplateModelInventory(models: readonly TemplateInventoryModel[]): string {
  const groups = new Map<string, TemplateInventoryModel[]>()
  for (const model of models) {
    const category = model.category ?? "uncategorized"
    const group = groups.get(category) ?? []
    group.push(model)
    groups.set(category, group)
  }

  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
  return [...groups.entries()]
    .sort(([left], [right]) => compare(left, right))
    .map(([category, group]) => {
      const entries = group
        .sort((left, right) => compare(left.id, right.id) || compare(left.path, right.path))
        .map((model) => {
          const bounds = model.bounds
            ? `; bounds: min [${model.bounds.min.join(", ")}] max [${model.bounds.max.join(", ")}]`
            : ""
          const animations = model.animations?.length
            ? `; animations: ${model.animations.map((animation) => `\`${animation.name}\` (${animation.category})`).join(", ")}`
            : ""
          return `- ${model.id}: \`${model.path}\`${bounds}${animations}`
        })
      return `#### ${category} (${group.length})\n${entries.join("\n")}`
    })
    .join("\n\n")
}
