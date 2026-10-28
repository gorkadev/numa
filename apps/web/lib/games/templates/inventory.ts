export type TemplateInventoryModel = {
  id: string
  path: string
  category?: string
  bounds?: { min: readonly number[]; max: readonly number[] }
  animations?: readonly { name: string; category: string }[]
}

/** Groups entries by category, both sorted, so the listing reads the same on every render. */
function renderGroupedInventory<T extends { id: string; path: string; category?: string }>(
  entries: readonly T[],
  renderEntry: (entry: T) => string
): string {
  const groups = new Map<string, T[]>()
  for (const entry of entries) {
    const category = entry.category ?? "uncategorized"
    const group = groups.get(category) ?? []
    group.push(entry)
    groups.set(category, group)
  }

  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
  return [...groups.entries()]
    .sort(([left], [right]) => compare(left, right))
    .map(([category, group]) => {
      const lines = group
        .sort((left, right) => compare(left.id, right.id) || compare(left.path, right.path))
        .map(renderEntry)
      return `#### ${category} (${group.length})\n${lines.join("\n")}`
    })
    .join("\n\n")
}

/** Complete, searchable manifest inventory; only presentation order changes. */
export function renderTemplateModelInventory(models: readonly TemplateInventoryModel[]): string {
  return renderGroupedInventory(models, (model) => {
    const bounds = model.bounds
      ? `; bounds: min [${model.bounds.min.join(", ")}] max [${model.bounds.max.join(", ")}]`
      : ""
    const animations = model.animations?.length
      ? `; animations: ${model.animations.map((animation) => `\`${animation.name}\` (${animation.category})`).join(", ")}`
      : ""
    return `- ${model.id}: \`${model.path}\`${bounds}${animations}`
  })
}

export type TemplateInventorySprite = {
  id: string
  path: string
  category: string
  frameWidth: number
  frameHeight: number
  frames: number
  fps?: number
  loop?: boolean
}

export type TemplateInventoryTileset = {
  id: string
  path: string
  tileSize: number
  columns: number
  rows: number
  tiles?: Readonly<Record<string, number>>
}

/** Sprite sheets grouped like models, each with the frame data `createSprite` needs. */
export function renderTemplateSpriteInventory(sprites: readonly TemplateInventorySprite[]): string {
  return renderGroupedInventory(sprites, (sprite) => {
    const frames = `${sprite.frames} frame${sprite.frames === 1 ? "" : "s"}`
    const fps = sprite.fps ? `, ${sprite.fps} fps` : ""
    const once = sprite.loop === false ? ", plays once" : ""
    return `- ${sprite.id}: \`${sprite.path}\` ${sprite.frameWidth}x${sprite.frameHeight}, ${frames}${fps}${once}`
  })
}

export function renderTemplateTilesetInventory(tilesets: readonly TemplateInventoryTileset[]): string {
  return tilesets
    .map((tileset) => {
      const names = Object.entries(tileset.tiles ?? {})
        .map(([name, index]) => `${name}=${index}`)
        .join(", ")
      return `- ${tileset.id}: \`${tileset.path}\` ${tileset.tileSize} px tiles, ${tileset.columns}x${tileset.rows}${names ? `; tiles: ${names}` : ""}`
    })
    .join("\n")
}

export const selectedTemplateReadinessPolicy = `### Initial asset readiness contract

For a fresh selected-template build with an accepted asset receipt, initialize \`window.__NUMA_VERIFY_READY__ = false\` before starting any initial asset loads. Request only the receipt's declared eager models on initial page load (at most six); load optional models only lazily in response to subsequent user actions. Wait for every declared eager model request and every required dependency (including referenced buffers and textures) to finish successfully and for the playable UI to be ready, then set \`window.__NUMA_VERIFY_READY__ = true\` before gameplay verification scenarios or user interactions. A required load failure must leave the flag false and show an error, never signal success. Do not set it merely because requests were started or the network appears idle. This readiness handshake applies to fresh selected-template builds with an accepted receipt, not no-template or historical no-receipt turns.`

/** The manifest fields the planner context reads; structural so it renders without the seed registry. */
export type TemplateContextManifest = {
  template: { id: string; version: number }
  assetRoot: string
  models: readonly TemplateInventoryModel[]
  sprites?: readonly TemplateInventorySprite[]
  tilesets?: readonly TemplateInventoryTileset[]
  sharedAssets?: readonly { id: string; path: string }[]
  licenseRisk?: { note: string; sourcePack: string }
  provenance: { three: Readonly<Record<string, unknown>> }
  vendor: { threeRevision: string }
  verification?: { requiredSelectors: readonly string[]; scenarios: readonly { name: string }[] }
}

/**
 * The selected template's planner context. A template without glTF models is
 * a 2D template: it lists sprites and tilesets instead, points at the
 * `engine-2d` skill, and carries no eager-model readiness contract, because
 * that contract counts glTF requests only.
 */
export function renderTemplateContext(contract: { descriptor: string; manifest: TemplateContextManifest }): string {
  const { manifest } = contract
  const hasModels = manifest.models.length > 0
  const sharedAssets = manifest.sharedAssets?.map((asset) => `\`${asset.path}\``).join(", ") ?? "none"
  const loaderFiles = Object.keys(manifest.provenance.three)
  const loaders = loaderFiles.map((file) => `\`${file}\``).join(", ")
  const verification = manifest.verification
  const licenseRisk = manifest.licenseRisk
    ? `- License-risk warning: ${manifest.licenseRisk.note} Source pack: \`${manifest.licenseRisk.sourcePack}\`; exposure acceptance is recorded.\n`
    : ""
  const verificationSummary = verification
    ? `- Required browser hooks: ${verification.requiredSelectors.map((selector) => `\`${selector}\``).join(", ")}\n- Declarative verification scenarios: ${verification.scenarios.map((scenario) => `\`${scenario.name}\``).join(", ")}`
    : "- No template-defined browser verification contract."

  const header = `## Selected starter template\n\nThe persisted selection is \`${manifest.template.id}@${manifest.template.version}\`. This contract was validated before the sandbox was created; use it as the source of truth.\n\n### Template descriptor\n\n${contract.descriptor}\n\n### Asset manifest and verification summary\n\n- Asset root: \`${manifest.assetRoot}\``

  if (hasModels) {
    const modelSummary = renderTemplateModelInventory(manifest.models)
    return `${header}
- Models (${manifest.models.length}):\n${modelSummary}\n- Shared assets: ${sharedAssets}\n- Seeded loader files: ${loaders}\n- Three.js revision: ${manifest.vendor.threeRevision}\n${licenseRisk}${verificationSummary}\n\nDo not invent asset paths or assume unlisted source-pack files are available.\n\n${selectedTemplateReadinessPolicy}`
  }

  const sprites = manifest.sprites?.length
    ? `\n- Sprites (${manifest.sprites.length}):\n${renderTemplateSpriteInventory(manifest.sprites)}`
    : ""
  const tilesets = manifest.tilesets?.length
    ? `\n- Tilesets (${manifest.tilesets.length}):\n${renderTemplateTilesetInventory(manifest.tilesets)}`
    : ""
  const loaderLine = loaderFiles.length ? `\n- Seeded loader files: ${loaders}` : ""
  return `${header}${sprites}${tilesets}\n- Shared assets: ${sharedAssets}${loaderLine}\n- Three.js revision: ${manifest.vendor.threeRevision}\n${licenseRisk}${verificationSummary}\n\nThis is a 2D template: draw it with the engine's sprites.js and tilemap.js, and add the \`engine-2d\` skill to every task that draws, animates or lays out the game (\`load_skill\` can load it too). Frame sizes and tile names above are exact; never infer them from image sizes.\n\nDo not invent asset paths or assume unlisted source-pack files are available.`
}

/**
 * The asset ids a plan may name, and whether a fresh build must record an
 * eager-asset receipt. Only glTF models take part in the receipt and the
 * verifier's initial-load check, so a template without models needs none.
 */
export function templateAssetCatalog(
  manifest: { models: readonly { id: string }[]; sharedAssets?: readonly { id: string }[] },
  isFreshGameBuild: boolean
) {
  return {
    modelIds: manifest.models.map((model) => model.id),
    sharedAssetIds: manifest.sharedAssets?.map((asset) => asset.id) ?? [],
    requiresAssetReceipt: isFreshGameBuild && manifest.models.length > 0,
  }
}
