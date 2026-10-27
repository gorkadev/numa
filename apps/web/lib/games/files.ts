/**
 * One entry of a sandbox listing, relative to the game directory — the same
 * shape `list_files` hands the model, so both readers of the sandbox agree on
 * what a path looks like.
 */
export type GameFileEntry = {
  path: string
  type: "file" | "directory"
  size?: number
}

export type FileTreeNode =
  | { type: "file"; name: string; path: string; size: number }
  | { type: "folder"; name: string; path: string; children: FileTreeNode[] }

type FolderNode = Extract<FileTreeNode, { type: "folder" }>

/**
 * Nests a flat listing into the tree the Files tab renders.
 *
 * Folders are created from file paths as well as from directory entries: a
 * listing cut off by its depth limit can name `a/b.txt` without ever naming
 * `a`, and the file must still land inside a folder rather than at the root.
 * Each level reads folders first, then files, both by name — the order every
 * editor's explorer uses, so nobody has to learn a new one.
 */
export function buildFileTree(entries: GameFileEntry[]): FileTreeNode[] {
  const root: FolderNode = { type: "folder", name: "", path: "", children: [] }
  const folders = new Map<string, FolderNode>([["", root]])

  function folderAt(path: string): FolderNode {
    const existing = folders.get(path)
    if (existing) return existing

    const slash = path.lastIndexOf("/")
    const parent = folderAt(slash === -1 ? "" : path.slice(0, slash))
    const folder: FolderNode = {
      type: "folder",
      name: path.slice(slash + 1),
      path,
      children: [],
    }
    parent.children.push(folder)
    folders.set(path, folder)
    return folder
  }

  for (const entry of entries) {
    if (entry.type === "directory") {
      folderAt(entry.path)
      continue
    }

    const slash = entry.path.lastIndexOf("/")
    folderAt(slash === -1 ? "" : entry.path.slice(0, slash)).children.push({
      type: "file",
      name: entry.path.slice(slash + 1),
      path: entry.path,
      size: entry.size ?? 0,
    })
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: FileTreeNode[]) {
  nodes.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1
  )
  for (const node of nodes) {
    if (node.type === "folder") sortTree(node.children)
  }
}

export type FileView =
  | { kind: "code"; language: string }
  | { kind: "image" }
  | { kind: "audio" }
  | { kind: "video" }
  | { kind: "binary" }

/** Extensions the highlighter in `lib/highlighter.tsx` knows, by the language name it expects. */
const CODE_LANGUAGES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  html: "html",
  htm: "html",
  css: "css",
  json: "json",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  sh: "bash",
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"])
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"])
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"])

/**
 * Files that are never worth trying as text. 3D models sit here until the
 * viewer can render them; a font or an archive has nothing to read.
 */
const BINARY_EXTENSIONS = new Set([
  "glb", "gltf", "fbx", "obj", "bin",
  "woff", "woff2", "ttf", "otf",
  "zip", "gz", "tar", "wasm", "pdf",
])

/**
 * How the Files tab shows a path, decided from its extension alone so the
 * choice is made before anything is fetched.
 *
 * Anything unrecognised opens as plain text: a game is mostly text, and the
 * content endpoint still refuses a file that turns out to hold binary data,
 * so guessing "text" costs at worst one notice instead of hiding a readable
 * file. SVG is an image on purpose — rendered through `<img>`, its scripts
 * never run.
 */
export function fileViewOf(path: string): FileView {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ""

  const language = CODE_LANGUAGES[extension]
  if (language) return { kind: "code", language }
  if (IMAGE_EXTENSIONS.has(extension)) return { kind: "image" }
  if (AUDIO_EXTENSIONS.has(extension)) return { kind: "audio" }
  if (VIDEO_EXTENSIONS.has(extension)) return { kind: "video" }
  if (BINARY_EXTENSIONS.has(extension)) return { kind: "binary" }
  return { kind: "code", language: "text" }
}

/**
 * The largest file the viewer shows as text. Past this the highlighter would
 * spend seconds on one render; a game's own sources sit far below it. The
 * tree already reports every size, so the client skips the request for a
 * larger file and the server refuses one that slips through.
 */
export const MAX_VIEW_BYTES = 512 * 1024

/**
 * Where the viewer loads a media asset from: the preview proxy, which already
 * serves the game directory behind its signed token and sandbox CSP. The
 * version is a cache key — the agent rewrites assets in place, and without it
 * the browser would keep showing the old bytes under the same URL.
 */
export function previewAssetUrl(
  gameId: string,
  previewToken: string,
  path: string,
  version: number
): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `/api/games/${gameId}/preview/${previewToken}/${encoded}?v=${version}`
}

/**
 * The content endpoint's URL for one file at one version of the game.
 *
 * The version is what makes the response safe to cache forever: it changes
 * whenever a turn rewrites files, so a changed file is always a new URL and
 * the browser's own HTTP cache answers every repeat visit without a request.
 */
export function fileContentUrl(gameId: string, path: string, version: number): string {
  const query = new URLSearchParams({ path, v: String(version) })
  return `/api/games/${gameId}/files/content?${query}`
}

/** The content endpoint's `Cache-Control`: immutable for a versioned read, uncached otherwise. */
export function contentCacheControl(version: string | null): string {
  return version ? "private, max-age=31536000, immutable" : "no-store, private"
}

/** Whether hovering a file is worth warming the cache for: text the viewer will actually request. */
export function isPrefetchableText(file: { path: string; size: number }): boolean {
  return fileViewOf(file.path).kind === "code" && file.size <= MAX_VIEW_BYTES
}

/** The file node at `path`, or `undefined` once a refresh no longer lists it. */
export function findFile(
  nodes: FileTreeNode[],
  path: string
): Extract<FileTreeNode, { type: "file" }> | undefined {
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.path === path) return node
    } else if (path.startsWith(`${node.path}/`)) {
      return findFile(node.children, path)
    }
  }
  return undefined
}
