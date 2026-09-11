import type { ToolSet } from "ai"

import {
  createDeleteFileTool,
  createListFilesTool,
  createReadFileTool,
  createReplaceTextTool,
  createWriteFileTool,
  type PathGuard,
} from "@/lib/games/tools"

/**
 * Whether `relative` falls inside one of a task's declared ownership entries
 * (design.md decision 12): an entry is either an exact file path, or a
 * directory prefix ending in `/` — `"levels/"` owns everything under
 * `levels/`, `"levels/level1.js"` owns only that one file.
 */
function isOwned(relative: string, owns: readonly string[]): boolean {
  return owns.some(
    (entry) => entry === relative || (entry.endsWith("/") && relative.startsWith(entry))
  )
}

/**
 * Whether two declared ownership entries conflict, by the same rule as
 * `isOwned` above but between two entries rather than a path and a list:
 * they conflict when they are equal, or when one is a directory prefix
 * ("ends in `/`") of the other — a directory owns everything nested under
 * it, files and other directories alike (design.md decision 12).
 */
function entriesConflict(a: string, b: string): boolean {
  if (a === b) return true
  if (a.endsWith("/") && b.startsWith(a)) return true
  if (b.endsWith("/") && a.startsWith(b)) return true
  return false
}

/**
 * Whether two tasks' declared ownership sets share any path — the pairwise
 * check `run_tasks` (unit 4) runs before letting two tasks dispatch
 * concurrently. `file-ownership`'s Parallel Dispatch Requires Disjoint
 * Ownership requirement, and `agent-orchestration`'s concurrent half of the
 * same rule, both name this exact check.
 */
export function ownershipOverlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((entryA) => b.some((entryB) => entriesConflict(entryA, entryB)))
}

/**
 * The ownership guard a scoped worker's write tools apply on top of
 * `tools.ts`'s own protected-prefix guard (design.md decision 11: checks run
 * "in order", protected prefix first, then ownership). Named in the error so
 * a worker that tried to write outside its task can tell which check it
 * failed — `file-ownership`'s Out-of-Scope Writes Are Rejected With an
 * Actionable Error requirement names both the offending path and the fact
 * that it is out of scope.
 */
function ownershipGuard(owns: readonly string[]): PathGuard {
  return (relative) =>
    isOwned(relative, owns)
      ? undefined
      : {
          error: `"${relative}" is outside this task's declared ownership (${owns.join(", ") || "nothing"}). Only write to a path this task owns.`,
        }
}

/**
 * Builds the write-capable tool set a `gameplay`/`visuals`/`audio` worker
 * gets for one dispatched task (`file-ownership`'s Declared Ownership Per
 * Task requirement: "its write tools MUST be scoped to exactly that set for
 * the duration of its run").
 *
 * Composed from the same builders `createGameTools` itself calls
 * (`lib/games/tools.ts`), not a parallel implementation, so a path resolves
 * and a protected directory is rejected exactly the way it does for the
 * orchestrator's own unscoped tools — the only difference here is the
 * ownership guard layered on top of every write tool.
 *
 * No `ask_player`: workers never get it
 * (`agent-orchestration`'s `ask_player` Stays With the Orchestrator
 * requirement names every worker role, not only explorer, which already
 * excludes it the same way in `harness/tools/explore.ts`).
 */
export function createScopedGameTools(
  gameId: string,
  owns: readonly string[]
): ToolSet {
  const guard = ownershipGuard(owns)

  return {
    read_file: createReadFileTool(gameId),
    list_files: createListFilesTool(gameId),
    write_file: createWriteFileTool(gameId, guard),
    replace_text: createReplaceTextTool(gameId, guard),
    delete_file: createDeleteFileTool(gameId, guard),
  }
}
