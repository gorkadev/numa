import { googleVertex } from "@ai-sdk/google-vertex"
import type { LanguageModel } from "ai"

import type { ModelEntry, ModelEntryId, ProviderId } from "./model-registry"

/**
 * Server-only: the provider instances themselves.
 *
 * Nothing here may be imported from a client component. `googleVertex` reads
 * the service account credentials out of the environment, and this module is
 * the boundary that keeps that dependency behind the registry — the browser
 * side of the choice lives in `./model-catalog`, and the registry entries that
 * name a provider live in `./model-registry`.
 *
 * Only `ModelEntry`/`ModelEntryId`/`ProviderId` are imported from
 * `./model-registry`, and only as types, so this file never has to run before
 * that one at module load — the registry calls `providerModel`, and a runtime
 * import back the other way would be a real circular dependency.
 */

/**
 * One factory per provider. An entry naming a provider missing from this
 * table fails typecheck, which is the enforcement decision 18 promises: a
 * provider not yet installed cannot silently reach a role.
 */
const PROVIDERS: Record<ProviderId, (providerModelId: string) => LanguageModel> =
  {
    "google-vertex": googleVertex,
  }

/**
 * Built on first use rather than at module load, so importing this file never
 * demands credentials for a model the process may not end up calling, and one
 * instance per registry entry is then reused for the lifetime of the worker.
 *
 * Keyed by `ModelEntryId` rather than by provider model id: two entries can
 * share a provider model id and differ only in `providerOptions` (the
 * `<model>@<effort>` convention in `design.md`), and each needs its own cached
 * instance because provider options that must travel with every call are set
 * where the request is built, at the call site, not on the provider instance.
 */
const instances = new Map<ModelEntryId, LanguageModel>()

export function providerModel(entry: ModelEntry): LanguageModel {
  const cached = instances.get(entry.id)

  if (cached) return cached

  const model = PROVIDERS[entry.provider](entry.providerModelId)

  instances.set(entry.id, model)

  return model
}
