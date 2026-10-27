import { DaytonaFileNotFoundError } from "@daytona/sdk"

import type { GameFileEntry } from "@/lib/games/files"
import { GAME_DIR, resolveGamePath } from "@/lib/games/game-path"

/**
 * The slice of Daytona's `sandbox.fs` the Files tab reads through, narrowed
 * to the fields it uses so the rules below can be tested without a sandbox.
 */
export type GameFs = {
  listFiles(
    path: string,
    options?: { depth?: number }
  ): Promise<{ name: string; path?: string; isDir: boolean; size: number }[]>
  getFileDetails(path: string): Promise<{ isDir: boolean; size: number }>
  downloadFile(path: string): Promise<Buffer>
}

/**
 * How deep the Files tab walks. Deeper than `list_files`' own cap because a
 * person browsing wants the whole game in one listing, while a game is still
 * only a few directories deep — this is a backstop against something like a
 * copied dependency tree, not a limit anyone should reach.
 */
export const FILE_TREE_DEPTH = 8

/**
 * The largest file the viewer shows. Past this the highlighter would spend
 * seconds on one render and the response would dwarf everything else on the
 * page; a game's own sources sit far below it.
 */
export const MAX_VIEW_BYTES = 512 * 1024

export async function listGameFiles(fs: GameFs): Promise<GameFileEntry[]> {
  const entries = await fs.listFiles(GAME_DIR, { depth: FILE_TREE_DEPTH })

  return entries.map((entry) => {
    const path = (entry.path ?? `${GAME_DIR}/${entry.name}`).slice(GAME_DIR.length + 1)
    return entry.isDir
      ? { path, type: "directory" as const }
      : { path, type: "file" as const, size: entry.size }
  })
}

export type ReadGameFileResult =
  | { ok: true; path: string; content: string }
  | { ok: false; reason: "invalid_path" | "not_found" | "directory" }
  | { ok: false; reason: "too_large" | "binary"; size: number }

/**
 * Reads one file as text for the viewer.
 *
 * The path goes through `resolveGamePath`, the same guard the agent's own
 * tools use, so a request can never name anything outside the game
 * directory. The size is checked before downloading: refusing a large file
 * after pulling it out of the sandbox would pay for the transfer anyway.
 */
export async function readGameTextFile(fs: GameFs, input: string): Promise<ReadGameFileResult> {
  const resolved = resolveGamePath(input)
  if ("error" in resolved) return { ok: false, reason: "invalid_path" }

  let details: { isDir: boolean; size: number }
  try {
    details = await fs.getFileDetails(resolved.path)
  } catch (error) {
    if (error instanceof DaytonaFileNotFoundError) return { ok: false, reason: "not_found" }
    throw error
  }

  if (details.isDir) return { ok: false, reason: "directory" }
  if (details.size > MAX_VIEW_BYTES) return { ok: false, reason: "too_large", size: details.size }

  const content = (await fs.downloadFile(resolved.path)).toString("utf-8")
  if (content.includes("\u0000")) return { ok: false, reason: "binary", size: details.size }

  return { ok: true, path: resolved.relative, content }
}
