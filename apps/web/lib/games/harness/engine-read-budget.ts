/**
 * How many `engine/` files one worker may read before being sent back to what
 * it was already given. Every worker carries the engine API index and its
 * role's skills; reading the engine source on top of that (~35k tokens for
 * all of it) was the single largest repeated cost in a build, paid again by
 * every agent. A couple of reads still covers a genuinely missing detail.
 */
export const WORKER_ENGINE_READS = 2

function isEngineFile(path: string): boolean {
  const normalized = path.replace(/^\.\//, "")
  return normalized === "engine" || normalized.startsWith("engine/")
}

/**
 * A `read_file` guard (`lib/games/tools.ts`'s `ReadBudgetGuard`) that lets
 * through every game file and the first `limit` engine files, then refuses
 * further engine reads with a pointer to the index and `load_skill`.
 */
export function engineReadBudget(limit: number): (path: string) => { error: string } | undefined {
  let reads = 0

  return (path) => {
    if (!isEngineFile(path)) return undefined
    if (reads < limit) {
      reads += 1
      return undefined
    }
    return {
      error: `You have already read ${limit} engine files. The Engine API index in your instructions lists every engine export with its parameters, and load_skill gives the full reference for an area — build from those instead of reading engine/ source.`,
    }
  }
}
