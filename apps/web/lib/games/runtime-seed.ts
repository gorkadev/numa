import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

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
 * The on-disk source of the seed.
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

/**
 * Reads the runtime folder into memory, recursing into subdirectories.
 *
 * The folder is the single source of truth for what a game starts with: adding
 * a file to it is the whole act of seeding it into every future sandbox, with
 * no registry to update and no code to touch. That is worth a directory walk
 * on sandbox creation, which happens once per game.
 *
 * Empty directories are reported too. A folder that exists on disk with
 * nothing in it is a deliberate slot — `assets/`, say — and a sandbox that
 * silently lacked it would make the first write into it fail.
 */
export async function readRuntimeSeed(): Promise<RuntimeSeed> {
  const entries = await readdir(RUNTIME_DIR, {
    recursive: true,
    withFileTypes: true,
  })

  const folders: string[] = []
  const reads: Promise<RuntimeSeedFile>[] = []

  for (const entry of entries) {
    /**
     * `parentPath` is absolute, so the relative path has to be derived from it
     * rather than from `entry.name`, which is only the basename — without this
     * every nested file would flatten into the root of the game directory.
     */
    const absolute = path.join(entry.parentPath, entry.name)
    /**
     * Normalised to forward slashes: the destination is a path in a Linux
     * sandbox, not on whatever machine happens to be reading this folder.
     */
    const relativePath = path
      .relative(RUNTIME_DIR, absolute)
      .split(path.sep)
      .join("/")

    if (entry.isDirectory()) {
      folders.push(relativePath)
    } else if (entry.isFile()) {
      reads.push(
        readFile(absolute).then((contents) => ({ relativePath, contents }))
      )
    }
  }

  return {
    // Shallow before deep: creating `assets/sprites` before `assets` would ask
    // the sandbox to create a directory whose parent is not there yet.
    folders: folders.sort((a, b) => a.split("/").length - b.split("/").length),
    files: await Promise.all(reads),
  }
}
