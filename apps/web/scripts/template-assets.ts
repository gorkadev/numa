/**
 * Moves a template's asset bytes between a local mirror and the R2 bucket.
 *
 *   pnpm template-assets push <template>   validate, upload, rewrite the lock
 *   pnpm template-assets pull <template>   restore the local mirror from R2
 *
 * The mirror lives in `.template-assets/<template>/` (gitignored, never
 * bundled) with the same seed-relative paths the sandbox gets (`assets/…`).
 * `push` validates the glTF dependency closure and the manifest's animation
 * names against the real bytes before uploading, because nothing else ever
 * reads those bytes again until a game is created.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  assetBlobKey,
  fetchLockedAssets,
  parseAssetLock,
  templateAssetsBaseUrl,
  TEMPLATE_ASSET_LOCK_PATH,
  type AssetLock,
} from "../lib/games/templates/asset-lock"
import { parseTemplateManifest, TEMPLATE_MANIFEST_PATH } from "../lib/games/templates/seed"

const BUCKET = "numa-template-assets"
const WRANGLER = "wrangler@4.153.0"

const [command, template] = process.argv.slice(2)
if (!template || !/^[a-z0-9-]+$/.test(template) || (command !== "push" && command !== "pull")) {
  console.error("Usage: tsx scripts/template-assets.ts <push|pull> <template>")
  process.exit(1)
}

const seedDir = path.join(process.cwd(), "lib", "games", "templates", template, "seed")
const mirrorDir = path.join(process.cwd(), ".template-assets", template)
const lockPath = path.join(seedDir, TEMPLATE_ASSET_LOCK_PATH)

async function readMirror(): Promise<Map<string, Buffer>> {
  const entries = await readdir(mirrorDir, { recursive: true, withFileTypes: true })
  const files = new Map<string, Buffer>()
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const absolute = path.join(entry.parentPath, entry.name)
    files.set(path.relative(mirrorDir, absolute).split(path.sep).join("/"), await readFile(absolute))
  }
  return files
}

async function validateMirror(files: Map<string, Buffer>): Promise<void> {
  const manifest = parseTemplateManifest(await readFile(path.join(seedDir, TEMPLATE_MANIFEST_PATH)))
  const problems: string[] = []

  for (const model of manifest.models) {
    const contents = files.get(model.path)
    if (!contents) {
      problems.push(`missing model ${model.path}`)
      continue
    }
    for (const dependency of [model.bufferPath, model.atlasPath]) {
      if (dependency && !files.has(dependency)) problems.push(`missing ${dependency} for ${model.id}`)
    }
    if (!model.path.endsWith(".gltf")) continue

    const gltf = JSON.parse(contents.toString("utf8")) as {
      animations?: { name: string }[]
      buffers?: { uri?: string }[]
      images?: { uri?: string }[]
    }
    for (const { uri } of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
      if (!uri || uri.startsWith("data:")) continue
      if (/^[a-z]+:/i.test(uri)) {
        problems.push(`${model.path} has remote dependency ${uri}`)
        continue
      }
      const dependency = path.posix.join(path.posix.dirname(model.path), decodeURIComponent(uri))
      if (!files.has(dependency)) problems.push(`${model.path} needs missing ${dependency}`)
    }
    if (model.animations) {
      const declared = model.animations.map((clip) => clip.name).sort()
      const actual = (gltf.animations ?? []).map((clip) => clip.name).sort()
      if (declared.join("\0") !== actual.join("\0")) problems.push(`${model.path} animations differ from ${TEMPLATE_MANIFEST_PATH}`)
    }
  }
  for (const asset of manifest.sharedAssets ?? []) {
    if (!files.has(asset.path)) problems.push(`missing shared asset ${asset.path}`)
  }

  if (problems.length) throw new Error(`Template ${template} assets are invalid:\n- ${problems.join("\n- ")}`)
}

async function push(): Promise<void> {
  const files = await readMirror()
  await validateMirror(files)

  const lock: AssetLock = { version: 1, files: {} }
  const blobs = new Map<string, string>()
  for (const relativePath of [...files.keys()].sort()) {
    const contents = files.get(relativePath)!
    const sha256 = createHash("sha256").update(contents).digest("hex")
    lock.files[relativePath] = { sha256, size: contents.length }
    blobs.set(sha256, path.join(mirrorDir, relativePath))
  }

  // Blobs are immutable and keyed by hash, so anything already public is skipped.
  const baseUrl = templateAssetsBaseUrl().replace(/\/?$/, "/")
  const missing: { key: string; file: string }[] = []
  for (const [sha256, file] of blobs) {
    const response = await fetch(new URL(assetBlobKey(sha256), baseUrl), { method: "HEAD" })
    if (!response.ok) missing.push({ key: assetBlobKey(sha256), file })
  }

  if (missing.length) {
    const scratch = path.join(tmpdir(), `template-assets-${process.pid}.json`)
    await writeFile(scratch, JSON.stringify(missing))
    try {
      execFileSync(
        "pnpm",
        ["dlx", WRANGLER, "r2", "bulk", "put", BUCKET, "--remote", "--filename", scratch,
          "--content-type", "application/octet-stream",
          "--cache-control", "public, max-age=31536000, immutable"],
        { stdio: "inherit" }
      )
    } finally {
      await rm(scratch, { force: true })
    }
  }

  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`${template}: ${files.size} files, ${blobs.size} blobs (${missing.length} uploaded), lock written`)
}

async function pull(): Promise<void> {
  const lock = parseAssetLock(await readFile(lockPath))
  const seed = await fetchLockedAssets(lock, { baseUrl: templateAssetsBaseUrl() })
  for (const { relativePath, contents } of seed.files) {
    const destination = path.join(mirrorDir, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, contents)
  }
  console.log(`${template}: ${seed.files.length} files restored to ${path.relative(process.cwd(), mirrorDir)}`)
}

await (command === "push" ? push() : pull())
