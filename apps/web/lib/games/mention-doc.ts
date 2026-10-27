/**
 * The composer's editor document, reduced to the three node kinds its schema
 * has: paragraphs (one per line), text, and file mentions. The shape is
 * Tiptap's JSON, kept free of the editor so it can be tested on its own.
 */
export type MentionNode = { type: "mention"; attrs: { id: string; label: string } }
type InlineNode = { type: "text"; text: string } | MentionNode
type ParagraphNode = { type: "paragraph"; content?: InlineNode[] }
export type MentionDoc = { type: "doc"; content: ParagraphNode[] }

/** What a chip shows: the file's name, without the folders. */
export function mentionLabel(path: string) {
  return path.slice(path.lastIndexOf("/") + 1)
}

/**
 * The document for a plain-text message. `@path` becomes a chip only for a
 * path in `known` — files the game has, or chips the document already held —
 * so dictation or the improver writing `@nope` leaves it as text.
 */
export function textToDoc(text: string, known: ReadonlySet<string>): MentionDoc {
  return {
    type: "doc",
    content: text.split("\n").map((line) => {
      const content = lineToNodes(line, known)
      return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }
    }),
  }
}

function lineToNodes(line: string, known: ReadonlySet<string>): InlineNode[] {
  const nodes: InlineNode[] = []
  let text = ""
  let last = 0
  for (const match of line.matchAll(/(^|\s)@([^\s@]+)/g)) {
    const path = match[2]!
    if (!known.has(path)) continue
    const at = match.index + match[1]!.length
    text += line.slice(last, at)
    if (text) nodes.push({ type: "text", text })
    text = ""
    nodes.push({ type: "mention", attrs: { id: path, label: mentionLabel(path) } })
    last = at + 1 + path.length
  }
  text += line.slice(last)
  if (text) nodes.push({ type: "text", text })
  return nodes
}

/** The message text: each chip as `@` and its full path, which is what the agent reads. */
export function docToText(doc: { content?: { content?: unknown[] }[] }): string {
  return (doc.content ?? [])
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => {
          const inline = node as InlineNode
          return inline.type === "mention" ? `@${inline.attrs.id}` : inline.text
        })
        .join("")
    )
    .join("\n")
}

/** The paths the document already shows as chips. */
export function mentionedPaths(doc: { content?: { content?: unknown[] }[] }): Set<string> {
  const paths = new Set<string>()
  for (const paragraph of doc.content ?? []) {
    for (const node of paragraph.content ?? []) {
      const inline = node as InlineNode
      if (inline.type === "mention") paths.add(inline.attrs.id)
    }
  }
  return paths
}
