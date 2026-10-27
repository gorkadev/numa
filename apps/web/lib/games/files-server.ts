import { DaytonaFileNotFoundError } from "@daytona/sdk"

import { MAX_VIEW_BYTES, type GameFileEntry } from "@/lib/games/files"
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
  downloadFile(path: string): Promise<Buffer>
}

/**
 * How deep the Files tab walks. Deeper than `list_files`' own cap because a
 * person browsing wants the whole game in one listing, while a game is still
 * only a few directories deep — this is a backstop against something like a
 * copied dependency tree, not a limit anyone should reach.
 */
export const FILE_TREE_DEPTH = 8

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
  | { ok: false; reason: "invalid_path" | "not_found" }
  | { ok: false; reason: "too_large" | "binary"; size: number }

/**
 * Reads one file as text for the viewer, in a single sandbox call.
 *
 * The path goes through `resolveGamePath`, the same guard the agent's own
 * tools use, so a request can never name anything outside the game
 * directory. There is no metadata call ahead of the download: the client
 * already knows each size from the tree and never asks for an oversized
 * file, so checking first would add a round trip to every normal read just
 * to save one on a request the UI does not make.
 */
export async function readGameTextFile(fs: GameFs, input: string): Promise<ReadGameFileResult> {
  const resolved = resolveGamePath(input)
  if ("error" in resolved) return { ok: false, reason: "invalid_path" }

  let bytes: Buffer
  try {
    bytes = await fs.downloadFile(resolved.path)
  } catch (error) {
    if (error instanceof DaytonaFileNotFoundError) return { ok: false, reason: "not_found" }
    throw error
  }

  if (bytes.length > MAX_VIEW_BYTES) return { ok: false, reason: "too_large", size: bytes.length }

  const content = bytes.toString("utf-8")
  if (content.includes("\u0000")) return { ok: false, reason: "binary", size: bytes.length }

  return { ok: true, path: resolved.relative, content }
}
