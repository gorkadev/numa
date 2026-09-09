import { googleVertex } from "@ai-sdk/google-vertex"
import type { LanguageModel } from "ai"

import type { GameModelId } from "./model-catalog"

/**
 * Server-only: the provider instances themselves.
 *
 * Nothing here may be imported from a client component. `googleVertex` reads
 * the service account credentials out of the environment, and this module is
 * the boundary that keeps that dependency behind the agent — the browser side
 * of the choice lives in `./model-catalog`.
 */

/**
 * Built on first use rather than at module load, so importing this file never
 * demands credentials for a model the process may not end up calling, and one
 * instance per id is then reused for the lifetime of the worker.
 */
const instances = new Map<GameModelId, LanguageModel>()

export function gameModel(id: GameModelId): LanguageModel {
  const cached = instances.get(id)

  if (cached) return cached

  const model = googleVertex(id)

  instances.set(id, model)

  return model
}
