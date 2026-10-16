import { createHash } from "node:crypto"
import path from "node:path"

import { z } from "zod"

import {
  mergeRuntimeSeeds,
  readRuntimeSeed,
  readSeedDirectory,
  type RuntimeSeed,
} from "../runtime-seed"

export const TEMPLATE_DESCRIPTOR_PATH = "TEMPLATE.md"
export const TEMPLATE_MANIFEST_PATH = "ASSETS.json"

/**
 * This module is server-only by construction: Node filesystem imports and its
 * callers keep it out of client bundles, while remaining directly executable
 * by deployment and verification tooling outside Next.js.
 */
const manifestPathSchema = z
  .string()
  .min(1)
  .refine(
    (candidate) =>
      !path.posix.isAbsolute(candidate) &&
      !candidate.split("/").includes("..") &&
      candidate !== ".",
    "must be a relative seed path"
  )

const modelCategorySchema = z.enum([
  "player",
  "animal",
  "character",
  "enemy",
  "terrain",
  "pixel-terrain",
  "vegetation",
  "collectible",
  "structure",
  "prop",
  "tool",
])

const animationCategorySchema = z.enum([
  "idle",
  "locomotion",
  "attack",
  "reaction",
  "death",
  "jump",
  "emote",
])

const templateManifestSchema = z
  .object({
    template: z
      .object({
        id: z.string().min(1),
        version: z.number().int(),
      })
      .strict(),
    assetRoot: manifestPathSchema,
    models: z.array(
      z
        .object({
          id: z.string().min(1),
          path: manifestPathSchema,
          bufferPath: manifestPathSchema.optional(),
          atlasPath: manifestPathSchema.optional(),
          category: modelCategorySchema.optional(),
          animations: z
            .array(
              z
                .object({
                  name: z.string().min(1),
                  category: animationCategorySchema,
                })
                .strict()
            )
            .optional(),
        })
        .strict()
    ),
    sharedAssets: z
      .array(
        z
          .object({
            id: z.string().min(1),
            path: manifestPathSchema,
            usedBy: z.array(z.string().min(1)),
          })
          .strict()
      )
      .optional(),
    licenseEvidence: z
      .object({
        path: manifestPathSchema,
        license: z.string().min(1),
        sourcePack: z.string().min(1),
      })
      .strict()
      .optional(),
    licenseRisk: z
      .object({
        status: z.literal("missing-local-evidence"),
        sourcePack: z.string().min(1),
        exposureAccepted: z.literal(true),
        note: z.string().min(1),
      })
      .strict()
      .optional(),
    provenance: z
      .object({
        three: z.record(
          manifestPathSchema,
          z
            .object({
              sourceUrl: z.string().min(1),
              sha256: z.string().min(1),
            })
            .strict()
        ),
      })
      .strict(),
    verification: z
      .object({
        requiredSelectors: z.array(z.string().min(1)).min(1).max(8),
        touchViewport: z
          .object({
            width: z.number().int().min(240).max(640),
            height: z.number().int().min(400).max(1200),
          })
          .strict(),
        scenarios: z
          .array(
            z
              .object({
                name: z.string().min(1).max(80),
                actions: z
                  .array(
                    z.union([
                      z.object({ type: z.literal("click"), selector: z.string().min(1) }).strict(),
                      z
                        .object({ type: z.literal("waitFor"), selector: z.string().min(1) })
                        .strict(),
                    ])
                  )
                  .max(6),
                assertions: z
                  .array(
                    z
                      .object({
                        path: z
                          .string()
                          .regex(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/),
                        equals: z.union([z.string(), z.number(), z.boolean(), z.null()]),
                      })
                      .strict()
                  )
                  .min(1)
                  .max(6),
              })
              .strict()
          )
          .min(1)
          .max(5),
      })
      .strict()
      .optional(),
    vendor: z
      .object({
        threeRevision: z.string().min(1),
        commonRuntimeDependencies: z.array(manifestPathSchema),
      })
      .strict(),
  })
  .strict()

type TemplateManifest = z.infer<typeof templateManifestSchema>

export type TemplateContract = {
  descriptor: string
  manifest: TemplateManifest
}

/**
 * Server-only template seed registry. A game's persisted id and version form
 * the complete selection key: provisioning never accepts a template from a
 * request, URL, query string, or model decision.
 */
const TEMPLATE_SEED_DIRECTORIES: Readonly<Record<string, string | undefined>> =
  {
    "none@1": undefined,
    "fantasy-cards@1": path.join(
      process.cwd(),
      "lib",
      "games",
      "templates",
      "fantasy-cards",
      "seed"
    ),
    "toon-shooter@1": path.join(
      process.cwd(),
      "lib",
      "games",
      "templates",
      "toon-shooter",
      "seed"
    ),
    "cube-world@1": path.join(
      process.cwd(),
      "lib",
      "games",
      "templates",
      "cube-world",
      "seed"
    ),
  }

function templateKey(templateId: string, templateVersion: number): string {
  return `${templateId}@${templateVersion}`
}

export function parseTemplateManifest(contents: Buffer): TemplateManifest {
  let value: unknown
  try {
    value = JSON.parse(contents.toString("utf8"))
  } catch {
    throw new Error("Invalid template manifest: ASSETS.json is not valid JSON")
  }

  const result = templateManifestSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid template manifest: ${issues}`)
  }

  return result.data
}

function seedFileMap(seed: RuntimeSeed): Map<string, Buffer> {
  return new Map(seed.files.map(({ relativePath, contents }) => [relativePath, contents]))
}

function requireSeedFile(files: Map<string, Buffer>, relativePath: string): Buffer {
  const contents = files.get(relativePath)
  if (!contents) {
    throw new Error(`Template preflight failed: missing ${relativePath}`)
  }
  return contents
}

function importedSpecifiers(source: string): string[] {
  return [...source.matchAll(/\b(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier))
}

function validateLoaderImports(
  loaderPath: string,
  source: Buffer,
  files: Map<string, Buffer>
): void {
  for (const specifier of importedSpecifiers(source.toString("utf8"))) {
    if (specifier === "three") {
      requireSeedFile(files, "vendor/three/three.module.min.js")
      continue
    }

    if (specifier.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(loaderPath), specifier))
      requireSeedFile(files, resolved)
      continue
    }

    if (specifier.startsWith("three/addons/")) {
      requireSeedFile(files, `vendor/three/addons/${specifier.slice("three/addons/".length)}`)
      continue
    }

    throw new Error(`Template preflight failed: unsupported loader import ${specifier} in ${loaderPath}`)
  }
}

function validateTemplateContract(
  templateId: string,
  templateVersion: number,
  templateSeed: RuntimeSeed,
  mergedSeed: RuntimeSeed
): TemplateContract {
  const templateFiles = seedFileMap(templateSeed)
  const descriptor = requireSeedFile(templateFiles, TEMPLATE_DESCRIPTOR_PATH).toString("utf8").trim()
  if (!descriptor) {
    throw new Error("Template preflight failed: TEMPLATE.md is empty")
  }

  const manifest = parseTemplateManifest(
    requireSeedFile(templateFiles, TEMPLATE_MANIFEST_PATH)
  )
  if (manifest.template.id !== templateId || manifest.template.version !== templateVersion) {
    throw new Error(`Template preflight failed: manifest identity does not match ${templateKey(templateId, templateVersion)}`)
  }

  const mergedFiles = seedFileMap(mergedSeed)
  const declaredPaths = [
    ...manifest.models.flatMap((model) => [model.path, model.bufferPath, model.atlasPath]),
    ...(manifest.sharedAssets?.map((asset) => asset.path) ?? []),
    manifest.licenseEvidence?.path,
    ...Object.keys(manifest.provenance.three),
    ...manifest.vendor.commonRuntimeDependencies,
  ]

  for (const declaredPath of declaredPaths) {
    if (declaredPath) requireSeedFile(mergedFiles, declaredPath)
  }

  for (const [vendorPath, provenance] of Object.entries(manifest.provenance.three)) {
    const contents = requireSeedFile(mergedFiles, vendorPath)
    const actual = createHash("sha256").update(contents).digest("hex")
    if (actual !== provenance.sha256) {
      throw new Error(`Template preflight failed: SHA-256 mismatch for ${vendorPath}`)
    }
    validateLoaderImports(vendorPath, contents, mergedFiles)
  }

  return { descriptor, manifest }
}

/**
 * Resolves exactly one persisted template version. Unknown historical values
 * fail closed rather than accidentally provisioning a different starter kit.
 */
export async function readTemplateSeed(
  templateId: string,
  templateVersion: number
): Promise<RuntimeSeed> {
  const key = templateKey(templateId, templateVersion)

  if (!(key in TEMPLATE_SEED_DIRECTORIES)) {
    throw new Error(`Unknown game template seed: ${key}`)
  }

  const directory = TEMPLATE_SEED_DIRECTORIES[key]
  return directory ? readSeedDirectory(directory) : { folders: [], files: [] }
}

/** Returns the validated contract for a selected template, never for none@1. */
export async function readTemplateContract(
  templateId: string,
  templateVersion: number
): Promise<TemplateContract | undefined> {
  const templateSeed = await readTemplateSeed(templateId, templateVersion)
  if (templateId === "none" && templateVersion === 1) return undefined

  const runtimeSeed = await readRuntimeSeed()
  return validateTemplateContract(
    templateId,
    templateVersion,
    templateSeed,
    mergeRuntimeSeeds(runtimeSeed, templateSeed)
  )
}

/**
 * Builds and validates the complete initial filesystem for one game from the
 * common runtime plus the version selected when that game's row was created.
 */
export async function readGameSeed(
  templateId: string,
  templateVersion: number
): Promise<RuntimeSeed> {
  const [runtimeSeed, templateSeed] = await Promise.all([
    readRuntimeSeed(),
    readTemplateSeed(templateId, templateVersion),
  ])
  const seed = mergeRuntimeSeeds(runtimeSeed, templateSeed)

  if (!(templateId === "none" && templateVersion === 1)) {
    validateTemplateContract(templateId, templateVersion, templateSeed, seed)
  }

  return seed
}
