import { createHash } from "node:crypto"
import path from "node:path"

import { z } from "zod"

import { mergeRuntimeSeeds, type RuntimeSeed, type RuntimeSeedFile } from "../runtime-seed"

export const TEMPLATE_ASSET_LOCK_PATH = "ASSETS.lock.json"

/**
 * Template asset bytes live in object storage, not in the repository. Each
 * template commits this lock instead: the seed path of every asset with the
 * SHA-256 and size of its bytes. Blobs are stored by hash (`blobs/<sha256>`),
 * so an object never changes once written and the lock alone decides exactly
 * which bytes a new game receives.
 */
const lockPathSchema = z
  .string()
  .min(1)
  .refine(
    (candidate) =>
      !path.posix.isAbsolute(candidate) &&
      !candidate.split("/").includes("..") &&
      candidate !== ".",
    "must be a relative seed path"
  )

const assetLockSchema = z
  .object({
    version: z.literal(1),
    files: z.record(
      lockPathSchema,
      z
        .object({
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          size: z.number().int().nonnegative(),
        })
        .strict()
    ),
  })
  .strict()

export type AssetLock = z.infer<typeof assetLockSchema>

export function parseAssetLock(contents: Buffer): AssetLock {
  let value: unknown
  try {
    value = JSON.parse(contents.toString("utf8"))
  } catch {
    throw new Error(`Invalid template asset lock: ${TEMPLATE_ASSET_LOCK_PATH} is not valid JSON`)
  }

  const result = assetLockSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid template asset lock: ${issues}`)
  }

  return result.data
}

export function assetBlobKey(sha256: string): string {
  return `blobs/${sha256}`
}

/**
 * Public r2.dev URL of the `numa-template-assets` bucket. The blobs are public
 * by design, so this is not a secret; `TEMPLATE_ASSETS_URL` overrides it, e.g.
 * once the bucket is served from a custom domain.
 */
const DEFAULT_TEMPLATE_ASSETS_URL = "https://pub-c9cfca53d8364237968cc4355d3c0f7c.r2.dev"

export function templateAssetsBaseUrl(): string {
  return process.env.TEMPLATE_ASSETS_URL || DEFAULT_TEMPLATE_ASSETS_URL
}

export type FetchLockedAssetsOptions = {
  baseUrl: string
  fetch?: typeof fetch
  concurrency?: number
}

/**
 * Downloads every locked asset and checks it against its lock entry. A blob
 * that is missing or differs by a single byte fails the whole seed: a game
 * must start from exactly the bytes the template was reviewed with.
 */
export async function fetchLockedAssets(
  lock: AssetLock,
  { baseUrl, fetch: fetchBlob = fetch, concurrency = 8 }: FetchLockedAssetsOptions
): Promise<RuntimeSeed> {
  const entries = Object.entries(lock.files)
  const files: RuntimeSeedFile[] = []
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  let next = 0

  async function worker() {
    while (next < entries.length) {
      const [relativePath, expected] = entries[next++]!
      const response = await fetchBlob(new URL(assetBlobKey(expected.sha256), root).toString())
      if (!response.ok) {
        throw new Error(`Template asset ${relativePath} could not be downloaded: HTTP ${response.status}`)
      }

      const contents = Buffer.from(await response.arrayBuffer())
      const actual = createHash("sha256").update(contents).digest("hex")
      if (contents.length !== expected.size || actual !== expected.sha256) {
        throw new Error(`Template asset ${relativePath} does not match its lock`)
      }
      files.push({ relativePath, contents })
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker))

  const folders = new Set<string>()
  for (const { relativePath } of files) {
    for (let folder = path.posix.dirname(relativePath); folder !== "."; folder = path.posix.dirname(folder)) {
      folders.add(folder)
    }
  }

  return mergeRuntimeSeeds({ folders: [...folders], files })
}
