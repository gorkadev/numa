import type { FileTreeNode } from "./files"

/** Every file path in the tree, in the tree's order; folders are not mentionable. */
export function mentionFiles(tree: FileTreeNode[]): string[] {
  return tree.flatMap((node) => (node.type === "file" ? [node.path] : mentionFiles(node.children)))
}

/**
 * Every file matching a query, best first: a file name starting with it, then
 * a file name containing it, then a path containing it. Shorter paths win a
 * tie, being nearer the root and so more likely the one meant. Nothing is
 * cut off — the list scrolls, and a query like `gltf` means all of them.
 */
export function rankMentions(paths: string[], query: string): string[] {
  const needle = query.toLowerCase()
  if (!needle) return paths

  const scored: { path: string; score: number }[] = []
  for (const path of paths) {
    const lower = path.toLowerCase()
    const name = lower.slice(lower.lastIndexOf("/") + 1)
    const score = name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : lower.includes(needle) ? 2 : -1
    if (score !== -1) scored.push({ path, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.path.length - b.path.length)
    .map(({ path }) => path)
}
