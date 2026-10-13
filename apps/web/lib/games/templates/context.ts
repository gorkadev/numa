import "server-only"

import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { eq } from "drizzle-orm"

import { readPlanAssetReceipt } from "../harness/plan-store"
import { hasSuccessfulGameFileWrites, type AssetReceipt } from "../harness/plan-validation"

import { renderTemplateModelInventory } from "./inventory"
import { readTemplateContract } from "./seed"

/**
 * Builds bounded, server-authored template context for a planner. The planner
 * receives the persisted selection's descriptor and semantic inventory without
 * having to discover or parse a manifest from the sandbox on its own.
 */

export const selectedTemplateReadinessPolicy = `### Initial asset readiness contract

For a fresh selected-template build with an accepted asset receipt, initialize \`window.__NUMA_VERIFY_READY__ = false\` before starting any initial asset loads. Request only the receipt's declared eager models on initial page load (at most six); load optional models only lazily in response to subsequent user actions. Wait for every declared eager model request and every required dependency (including referenced buffers and textures) to finish successfully and for the playable UI to be ready, then set \`window.__NUMA_VERIFY_READY__ = true\` before gameplay verification scenarios or user interactions. A required load failure must leave the flag false and show an error, never signal success. Do not set it merely because requests were started or the network appears idle. This readiness handshake applies to fresh selected-template builds with an accepted receipt, not no-template or historical no-receipt turns.`

function renderTemplateContext(contract: NonNullable<Awaited<ReturnType<typeof readTemplateContract>>>): string {
  const { manifest } = contract
  const modelSummary = renderTemplateModelInventory(manifest.models)
  const sharedAssets = manifest.sharedAssets?.map((asset) => `\`${asset.path}\``).join(", ") ?? "none"
  const loaders = Object.keys(manifest.provenance.three).map((file) => `\`${file}\``).join(", ")
  const verification = manifest.verification
  const licenseRisk = manifest.licenseRisk
    ? `- License-risk warning: ${manifest.licenseRisk.note} Source pack: \`${manifest.licenseRisk.sourcePack}\`; exposure acceptance is recorded.\n`
    : ""
  const verificationSummary = verification
    ? `- Required browser hooks: ${verification.requiredSelectors.map((selector) => `\`${selector}\``).join(", ")}\n- Declarative verification scenarios: ${verification.scenarios.map((scenario) => `\`${scenario.name}\``).join(", ")}`
    : "- No template-defined browser verification contract."

  return `## Selected starter template\n\nThe persisted selection is \`${manifest.template.id}@${manifest.template.version}\`. This contract was validated before the sandbox was created; use it as the source of truth.\n\n### Template descriptor\n\n${contract.descriptor}\n\n### Asset manifest and verification summary\n\n- Asset root: \`${manifest.assetRoot}\`
- Models (${manifest.models.length}):\n${modelSummary}\n- Shared assets: ${sharedAssets}\n- Seeded loader files: ${loaders}\n- Three.js revision: ${manifest.vendor.threeRevision}\n${licenseRisk}${verificationSummary}\n\nDo not invent asset paths or assume unlisted source-pack files are available.\n\n${selectedTemplateReadinessPolicy}`
}

export type TemplateAssetVerificationPolicy = {
  /** Trusted manifest paths selected by the accepted plan receipt for first-page loading. */
  eagerModelPaths: string[]
}

/** Maps accepted receipt ids through the selected template's trusted manifest. */
export function eagerModelPathsFromReceipt(
  receipt: Pick<AssetReceipt, "eagerModelIds">,
  models: readonly { id: string; path: string }[]
): string[] | undefined {
  const pathsById = new Map(models.map((model) => [model.id, model.path]))
  const paths = receipt.eagerModelIds.map((id) => pathsById.get(id))
  return paths.every((path): path is string => typeof path === "string") ? paths : undefined
}

/** Pure comparison used by runtime-policy tests; paths stay case-sensitive. */
export function compareInitialTemplateModelPaths(
  requestedPaths: readonly string[],
  eagerModelPaths: readonly string[]
): string[] {
  const normalize = (path: string) => path.replace(/^\/+/, "")
  const requested = [...new Set(requestedPaths.map(normalize))].sort()
  const declared = [...new Set(eagerModelPaths.map(normalize))].sort()
  const failures: string[] = []

  if (requested.length > 6) {
    failures.push(`initial page requested ${requested.length} glTF models; at most 6 eager models are allowed`)
  }
  if (requested.join("\n") !== declared.join("\n")) {
    failures.push(
      `initial glTF paths differ from the accepted receipt (requested: ${requested.join(", ") || "none"}; declared: ${declared.join(", ") || "none"})`
    )
  }

  return failures
}

export type GameTemplateBuildContext = {
  templateContext: string
  isFreshGameBuild: boolean
  assetCatalog: {
    modelIds: string[]
    sharedAssetIds: string[]
    requiresAssetReceipt: boolean
  }
}

/**
 * Resolves the selected template and freshness from persisted game history,
 * never from the model's description of the requested work or template choice.
 */
export async function readGameTemplateBuildContext(gameId: string): Promise<GameTemplateBuildContext> {
  const [game] = await db
    .select({
      templateId: games.templateId,
      templateVersion: games.templateVersion,
      messages: games.messages,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) throw new Error(`Game ${gameId} does not exist`)

  const contract = await readTemplateContract(game.templateId, game.templateVersion)
  const isFreshGameBuild = !hasSuccessfulGameFileWrites(game.messages)
  if (!contract) {
    return {
      templateContext: "## Starter template\nNo starter template is selected. Do not expect template assets or a template contract.",
      isFreshGameBuild,
      assetCatalog: { modelIds: [], sharedAssetIds: [], requiresAssetReceipt: false },
    }
  }

  return {
    templateContext: renderTemplateContext(contract),
    isFreshGameBuild,
    assetCatalog: {
      modelIds: contract.manifest.models.map((model) => model.id),
      sharedAssetIds: contract.manifest.sharedAssets?.map((asset) => asset.id) ?? [],
      requiresAssetReceipt: isFreshGameBuild,
    },
  }
}

/** Backward-compatible planner-specific view of the persisted template context. */
export async function readGameTemplatePlanningContext(gameId: string): Promise<string> {
  return (await readGameTemplateBuildContext(gameId)).templateContext
}

/**
 * Host-authored runtime asset policy. Historical plans, including those with
 * receipts but without a readiness-policy marker, bypass the eager-load check.
 * Fresh selected-template plans retain the marker on subsequent updates until
 * a later accepted plan overwrites the artifact.
 */
export async function readGameTemplateAssetVerificationPolicy(
  gameId: string
): Promise<TemplateAssetVerificationPolicy | undefined> {
  const [game] = await db
    .select({ templateId: games.templateId, templateVersion: games.templateVersion })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) throw new Error(`Game ${gameId} does not exist`)

  const [contract, receipt] = await Promise.all([
    readTemplateContract(game.templateId, game.templateVersion),
    readPlanAssetReceipt(gameId),
  ])
  if (!contract || !receipt) return undefined

  const eagerModelPaths = eagerModelPathsFromReceipt(receipt, contract.manifest.models)
  if (!eagerModelPaths) {
    throw new Error("Accepted template asset receipt referenced an unknown manifest model")
  }

  return { eagerModelPaths }
}

export async function readGameTemplateVerification(gameId: string) {
  const [game] = await db
    .select({ templateId: games.templateId, templateVersion: games.templateVersion })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) throw new Error(`Game ${gameId} does not exist`)
  return (await readTemplateContract(game.templateId, game.templateVersion))?.manifest.verification
}
