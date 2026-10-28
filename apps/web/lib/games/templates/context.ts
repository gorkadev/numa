import "server-only"

import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { eq } from "drizzle-orm"

import { readPlanAssetReceipt } from "../harness/plan-store"
import type { GameDimension } from "../dimension"
import { hasSuccessfulGameFileWrites, type AssetReceipt } from "../harness/plan-validation"

import { getTemplate, isTemplateId } from "./catalog"
import { renderTemplateContext, selectedTemplateReadinessPolicy, templateAssetCatalog } from "./inventory"
import { readTemplateContract } from "./seed"

/**
 * Builds bounded, server-authored template context for a planner. The planner
 * receives the persisted selection's descriptor and semantic inventory without
 * having to discover or parse a manifest from the sandbox on its own.
 */

export { selectedTemplateReadinessPolicy }

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
  /** The persisted template's catalog dimension: picks the engine, instructions and skills. */
  dimension: GameDimension
  templateContext: string
  isFreshGameBuild: boolean
  assetCatalog: {
    modelIds: string[]
    sharedAssetIds: string[]
    requiresAssetReceipt: boolean
  }
}

/** A persisted template id's catalog dimension; an id the catalog no longer knows fails closed. */
function templateDimension(templateId: string): GameDimension {
  if (!isTemplateId(templateId)) throw new Error(`Unknown game template: ${templateId}`)
  return getTemplate(templateId).dimension
}

/** The game's dimension, from its persisted template — what its tools are built for. */
export async function readGameDimension(gameId: string): Promise<GameDimension> {
  const [game] = await db
    .select({ templateId: games.templateId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) throw new Error(`Game ${gameId} does not exist`)
  return templateDimension(game.templateId)
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

  const dimension = templateDimension(game.templateId)
  const contract = await readTemplateContract(game.templateId, game.templateVersion)
  const isFreshGameBuild = !hasSuccessfulGameFileWrites(game.messages)
  if (!contract) {
    return {
      dimension,
      templateContext: "## Starter template\nNo starter template is selected. Do not expect template assets or a template contract.",
      isFreshGameBuild,
      assetCatalog: { modelIds: [], sharedAssetIds: [], requiresAssetReceipt: false },
    }
  }

  return {
    dimension,
    templateContext: renderTemplateContext(contract),
    isFreshGameBuild,
    assetCatalog: templateAssetCatalog(contract.manifest, isFreshGameBuild),
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
