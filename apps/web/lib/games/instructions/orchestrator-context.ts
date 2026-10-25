import type { SystemModelMessage } from "ai"

import { engineApiIndex } from "./engine-index"

/**
 * What the orchestrator needs to write tasks itself, now that no planner sits
 * between it and the workers: the engine's API (so a task can name the calls
 * it should use instead of leaving a worker to guess), the game's template,
 * and — on a fresh template build — which asset ids its first dispatch must
 * declare. Per turn, because the template and the build's freshness belong to
 * the game, not to the agent.
 */
export function orchestratorContextInstructions({
  templateContext,
  requiresAssetReceipt,
  modelIds,
}: {
  templateContext: string
  requiresAssetReceipt: boolean
  modelIds: readonly string[]
}): SystemModelMessage[] {
  const receipt = requiresAssetReceipt
    ? `\n\n### This turn's first dispatch\nThis is a fresh build with a selected template: your first \`run_tasks\` call must pass \`assetReceipt\` with the 1-6 model ids the first screen loads eagerly. Model ids in this template: ${modelIds.join(", ")}.`
    : ""

  return [
    { role: "system", content: engineApiIndex },
    { role: "system", content: `${templateContext}${receipt}` },
  ]
}
