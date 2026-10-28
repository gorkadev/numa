import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { DIMENSION_PROFILES, type GameDimension } from "@/lib/games/dimension"

/**
 * One file destined for a fresh sandbox, addressed by its path *inside* the
 * runtime folder rather than on this machine — `index.html`,
 * `assets/sprite.svg`. The caller decides what that path hangs off in the
 * sandbox, so this module never needs to know where the game lives.
 */
export type RuntimeSeedFile = { relativePath: string; contents: Buffer }

/**
 * Everything a new sandbox starts life with: the directories to create, then
 * the files to write into them.
 *
 * Kept as two lists rather than one because the sandbox needs them in that
 * order — a file upload into a directory that does not exist has nothing to
 * land in. `folders` is sorted shallow-first for the same reason.
 */
export type RuntimeSeed = {
  folders: string[]
  files: RuntimeSeedFile[]
}

/**
 * The on-disk source of the common seed.
 *
 * Anchored on `process.cwd()` rather than on this module's own location,
 * because this code runs from two different places. Next.js executes it from
 * the app directory; Trigger.dev executes a bundled copy whose file layout has
 * nothing to do with `lib/games/`, but whose working directory mirrors the
 * project root (see `legacyDevProcessCwdBehaviour: false` in
 * `trigger.config.ts`). The working directory is the one thing both agree on.
 *
 * Nothing imports these files, so nothing pulls them into the Trigger.dev
 * bundle either — the `additionalFiles` extension in `trigger.config.ts` is
 * what puts them next to the deployed task. Moving this folder means moving
 * that glob too.
 */
const RUNTIME_DIR = path.join(process.cwd(), "lib", "games", "runtime")

function compareSeedPaths(left: string, right: string): number {
  const depthDifference = left.split("/").length - right.split("/").length
  return depthDifference || left.localeCompare(right)
}

/**
 * Reads a seed directory into memory, recursing into subdirectories.
 *
 * Empty directories are retained so a seed can deliberately reserve a place
 * for a later game write. Paths are sorted before reading, making the upload
 * order independent of the host filesystem's directory enumeration order.
 */
export async function readSeedDirectory(
  directory: string
): Promise<RuntimeSeed> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })

  const folders: string[] = []
  const filePaths: string[] = []

  for (const entry of entries) {
    const absolute = path.join(entry.parentPath, entry.name)
    const relativePath = path
      .relative(directory, absolute)
      .split(path.sep)
      .join("/")

    if (entry.isDirectory()) {
      folders.push(relativePath)
    } else if (entry.isFile()) {
      filePaths.push(relativePath)
    }
  }

  const files = await Promise.all(
    filePaths.sort((a, b) => a.localeCompare(b)).map(async (relativePath) => ({
      relativePath,
      contents: await readFile(path.join(directory, relativePath)),
    }))
  )

  return {
    folders: folders.sort(compareSeedPaths),
    files,
  }
}

/**
 * Merges seed layers predictably. Folders are de-duplicated, while a repeated
 * file destination is accepted only when its bytes are identical; two layers
 * silently writing different bytes to the same destination would make a
 * template's starting state depend on merge order.
 */
export function mergeRuntimeSeeds(...seeds: RuntimeSeed[]): RuntimeSeed {
  const folders = new Set<string>()
  const files = new Map<string, Buffer>()

  for (const seed of seeds) {
    for (const folder of seed.folders) {
      if (files.has(folder)) {
        throw new Error(`Seed destination is both a file and folder: ${folder}`)
      }
      folders.add(folder)
    }

    for (const { relativePath, contents } of seed.files) {
      if (folders.has(relativePath)) {
        throw new Error(
          `Seed destination is both a folder and file: ${relativePath}`
        )
      }

      const existing = files.get(relativePath)
      if (existing && !existing.equals(contents)) {
        throw new Error(`Conflicting seed file destination: ${relativePath}`)
      }
      if (!existing) files.set(relativePath, contents)
    }
  }

  return {
    folders: [...folders].sort(compareSeedPaths),
    files: [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relativePath, contents]) => ({ relativePath, contents })),
  }
}

/**
 * Reads the runtime folder into memory as one dimension's sandbox sees it:
 * `vendor/` whole, the profile's starter files at the root, and only the
 * profile's engine files under `engine/`, each under its sandbox name.
 */
export async function readRuntimeSeed(dimension: GameDimension): Promise<RuntimeSeed> {
  const { engineFiles, starterFiles } = DIMENSION_PROFILES[dimension]
  const sandboxNameBySource = new Map(
    Object.entries(engineFiles).map(([sandboxName, source]) => [source, sandboxName])
  )
  const { folders, files } = await readSeedDirectory(RUNTIME_DIR)

  const selected = files.flatMap((file) => {
    if (file.relativePath.startsWith("engine/")) {
      const sandboxName = sandboxNameBySource.get(file.relativePath.slice("engine/".length))
      return sandboxName ? [{ ...file, relativePath: `engine/${sandboxName}` }] : []
    }
    if (!file.relativePath.includes("/")) {
      return (starterFiles as readonly string[]).includes(file.relativePath) ? [file] : []
    }
    return [file]
  })

  const missing = Object.values(engineFiles).filter((source) => !files.some((file) => file.relativePath === `engine/${source}`))
  if (missing.length > 0) {
    throw new Error(`Runtime engine files missing for ${dimension}: ${missing.join(", ")}`)
  }

  return {
    folders,
    files: selected.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  }
}
