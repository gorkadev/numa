import type { FileTreeNode } from "@/lib/games/files"

/**
 * How long a listing may be reused when the version has not moved.
 *
 * The version already says when the files changed, so this is not about
 * freshness. It bounds how long the sandbox can go without being asked: the
 * listing route is also what wakes an archived sandbox and its preview server,
 * and a tab reopened long after the last fetch should do that again.
 */
const TTL_MS = 5 * 60_000

type Entry = {
  version: number
  fetchedAt: number
  tree: Promise<FileTreeNode[]>
}

type Options = {
  fetchTree: (gameId: string) => Promise<FileTreeNode[]>
  now?: () => number
  ttlMs?: number
}

/**
 * Listings of a game's files, one per `(gameId, version)`, shared by whoever
 * asks.
 *
 * The Files tab and the composer's `@` picker both read the same directory, and
 * the picker used to ask again on every `@`. Each ask costs a database read and
 * a sandbox round trip, so the second consumer now rides the first one's
 * request, in flight or finished.
 *
 * What is stored is the promise, not the result, which is what lets a consumer
 * arriving mid-request share it. A newer version replaces the entry, so a game
 * never holds more than one listing. A failed request is dropped at once, so
 * the next ask retries instead of replaying the failure.
 *
 * The request is not tied to any caller's `AbortSignal`: one consumer
 * unmounting must not cancel the listing another is waiting for. Callers
 * ignore a result they no longer want.
 */
export function createFileTreeCache({
  fetchTree,
  now = Date.now,
  ttlMs = TTL_MS,
}: Options) {
  const entries = new Map<string, Entry>()

  return function loadFileTree(
    gameId: string,
    version: number
  ): Promise<FileTreeNode[]> {
    const current = entries.get(gameId)

    if (
      current &&
      current.version === version &&
      now() - current.fetchedAt < ttlMs
    ) {
      return current.tree
    }

    const entry: Entry = {
      version,
      fetchedAt: now(),
      tree: fetchTree(gameId),
    }

    entries.set(gameId, entry)

    entry.tree.catch(() => {
      if (entries.get(gameId) === entry) entries.delete(gameId)
    })

    return entry.tree
  }
}

async function fetchTreeFromServer(gameId: string): Promise<FileTreeNode[]> {
  const response = await fetch(`/api/games/${gameId}/files`)

  if (!response.ok) throw new Error(String(response.status))

  const { tree } = (await response.json()) as { tree: FileTreeNode[] }

  return tree
}

export const loadFileTree = createFileTreeCache({
  fetchTree: fetchTreeFromServer,
})
