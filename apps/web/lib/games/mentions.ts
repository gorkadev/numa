import type { FileTreeNode } from "./files"

/** A mention being typed: where its `@` sits and what follows it up to the caret. */
export type ActiveMention = { start: number; query: string }

/**
 * The mention the caret is in, if any. An `@` only opens one at the start of
 * the text or after whitespace, so an address like `me@mail.com` never does,
 * and a space after the mention closes it — paths in a game never hold one.
 */
export function activeMention(value: string, caret: number): ActiveMention | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(value.slice(0, caret))
  if (!match) return null
  return { start: match.index + match[1]!.length, query: match[2]! }
}

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

/**
 * The text with the typed mention replaced by the chosen path, and the caret
 * placed after a single following space, so typing carries straight on.
 */
export function insertMention(
  value: string,
  mention: ActiveMention,
  path: string
): { value: string; caret: number } {
  const end = mention.start + 1 + mention.query.length
  const rest = value.slice(end)
  const inserted = `@${path}${/^\s/.test(rest) ? "" : " "}`
  const caret = mention.start + `@${path}`.length + 1
  return { value: value.slice(0, mention.start) + inserted + rest, caret }
}
