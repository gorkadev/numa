import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * Where the engine's own source lives, resolved the same way
 * `runtime-seed.ts`'s `RUNTIME_DIR` is: against `process.cwd()`, since this
 * module runs from two different places — Next.js from the app directory,
 * Trigger.dev from a bundled copy whose working directory still mirrors the
 * project root (`legacyDevProcessCwdBehaviour: false`, `trigger.config.ts`).
 * `lib/games/runtime/**` is already in that bundle's own `additionalFiles`
 * glob (`trigger.config.ts`), so nothing extra needs to ship for this to
 * read the same files at either call site.
 */
const ENGINE_DIR = path.join(process.cwd(), "lib", "games", "runtime", "engine")

/** Kept short: the index is a map, not the manual — a long summary here defeats the point of trading several read_file round trips for one line. */
const MAX_DOC_CHARS = 140

/** A long default-value expression (an inline object literal, mostly) gets cut rather than reproduced in full — the name and shape of a parameter list matters far more than an exact default. */
const MAX_SIGNATURE_CHARS = 160

/** One exported symbol from an engine source file, in the shape `renderFileSection` below turns into one line of the index. */
type EngineExport = {
  name: string
  /** The parameter list exactly as written, parens excluded — empty for a non-function export (an object/array/plain value, or one name out of a destructured re-export). */
  signature: string
  /** The first sentence of the JSDoc directly above this export, if it has one. */
  doc: string
}

/**
 * Collapses a JSDoc block's `* ` line prefixes into plain text, then keeps
 * only its first sentence — the index has no room for a whole doc comment
 * per export. Everything from the first `@param`/`@returns`-style tag line
 * onward is dropped, continuation lines included: JSDoc convention puts
 * prose before its tags, never after, so a doc that is nothing but tags
 * (`state.js`'s `createGameState`) has no description to extract at all —
 * an empty doc here is more honest than a fragment lifted out of the middle
 * of a wrapped `@param` description (`saveKey`'s own "Omit and\n *   nothing
 * is written." very nearly became one).
 */
function firstSentence(rawComment: string): string {
  const lines = rawComment.split("\n").map((line) => line.replace(/^\s*\*\/?\s?/, "").trim())
  const tagIndex = lines.findIndex((line) => line.startsWith("@"))
  const description = tagIndex === -1 ? lines : lines.slice(0, tagIndex)

  const text = description
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  const match = text.match(/^.*?[.!?](?=\s|$)/)
  const sentence = match ? match[0] : text

  return sentence.length > MAX_DOC_CHARS ? `${sentence.slice(0, MAX_DOC_CHARS - 1)}…` : sentence
}

/**
 * The JSDoc directly above `declStart` (a byte offset into `source`), if the
 * text immediately preceding it — once trailing whitespace is stripped — is
 * one. Every export in this codebase that has a doc comment has it adjacent,
 * with nothing but a newline in between (`physics.js`'s `createPhysics`, for
 * one) — a blank line, an import, or any other statement in between means no
 * doc for THIS export, not a doc to keep searching further back for; that is
 * what makes a plain `lastIndexOf("/**")` correct here rather than a full
 * comment scanner.
 */
function precedingDoc(source: string, declStart: number): string {
  const before = source.slice(0, declStart).trimEnd()
  if (!before.endsWith("*/")) return ""

  const openIndex = before.lastIndexOf("/**")
  if (openIndex === -1) return ""

  return firstSentence(before.slice(openIndex + 3, before.length - 2))
}

/**
 * Scans forward from `openIndex` (where `source[openIndex]` is `open`) to
 * its matching `close`, tracking nesting depth so a default value with its
 * own parens or braces — `seed = random.next()`, an inline `{}` — does not
 * end the scan early. Not string-literal-aware: safe here because none of
 * this engine's own default-value expressions put an unbalanced paren or
 * brace inside a string.
 */
function scanBalanced(
  source: string,
  openIndex: number,
  open: string,
  close: string
): { inner: string; endIndex: number } {
  let depth = 0
  let i = openIndex

  for (; i < source.length; i++) {
    if (source[i] === open) depth++
    else if (source[i] === close) {
      depth--
      if (depth === 0) {
        i += 1
        break
      }
    }
  }

  return { inner: source.slice(openIndex + 1, i - 1), endIndex: i }
}

function normalizeSignature(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim()
  return collapsed.length > MAX_SIGNATURE_CHARS
    ? `${collapsed.slice(0, MAX_SIGNATURE_CHARS - 1)}…`
    : collapsed
}

/** Every identifier a destructuring pattern's own top level binds — `{ a, b: renamed, c = 1 }` yields `["a", "renamed", "c"]`. Only ever sees the simple, flat pattern this engine's own re-export uses (`math.js`'s `THREE.MathUtils` block); a nested pattern would just contribute nothing rather than throw. */
function destructuredNames(inner: string): string[] {
  return inner
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const renamed = entry.split(":")[1]?.trim() ?? entry
      return renamed.split("=")[0]?.trim() ?? renamed
    })
    .filter((name) => /^\w+$/.test(name))
}

const FUNCTION_DECL = /^export (?:async function|function)\s+(\w+)\s*\(/
const CLASS_DECL = /^export class\s+(\w+)/
const CONST_DECL = /^export const\s+(\w+)/
const DESTRUCTURED_CONST = /^export const\s*\{/
const DECL_START = /^export (?:async function|function|class|const)\b/gm

/** One source file's own top-level exports, in declaration order — never anything a function returns or closes over (`physics.js`'s inner `addBody` is never exported, only `createPhysics` is). */
function extractExports(source: string): EngineExport[] {
  const exports: EngineExport[] = []

  let match: RegExpExecArray | null

  while ((match = DECL_START.exec(source))) {
    const declStart = match.index
    const rest = source.slice(declStart)

    if (DESTRUCTURED_CONST.test(rest)) {
      const openIndex = declStart + rest.indexOf("{")
      const { inner } = scanBalanced(source, openIndex, "{", "}")
      const doc = precedingDoc(source, declStart)

      for (const name of destructuredNames(inner)) {
        exports.push({ name, signature: "", doc })
      }
      continue
    }

    const functionMatch = rest.match(FUNCTION_DECL)
    if (functionMatch) {
      const openIndex = declStart + functionMatch[0].length - 1
      const { inner } = scanBalanced(source, openIndex, "(", ")")

      exports.push({
        name: functionMatch[1]!,
        signature: normalizeSignature(inner),
        doc: precedingDoc(source, declStart),
      })
      continue
    }

    const classMatch = rest.match(CLASS_DECL)
    if (classMatch) {
      exports.push({ name: classMatch[1]!, signature: "", doc: precedingDoc(source, declStart) })
      continue
    }

    const constMatch = rest.match(CONST_DECL)
    if (constMatch) {
      exports.push({ name: constMatch[1]!, signature: "", doc: precedingDoc(source, declStart) })
    }
  }

  return exports
}

function renderFileSection(fileName: string, source: string): string {
  const fileExports = extractExports(source)
  if (fileExports.length === 0) return ""

  const lines = fileExports.map(({ name, signature, doc }) => {
    const head = signature.length > 0 ? `${name}(${signature})` : name
    return doc.length > 0 ? `${head} — ${doc}` : head
  })

  return [`### engine/${fileName}`, ...lines].join("\n")
}

const HEADER = `## Engine API index

Every exported function and const from engine/*.js, generated from the actual source: names and parameter lists exactly as written, plus a one-line summary where the source has one. This lists the engine's exports — read an engine file yourself only when a task needs more than this gives you (a function body, an edge case, an exact default). When you do need more than one file, request them all in the SAME step (parallel read_file calls), never one read per step.`

/**
 * Builds the whole index from `engineDir`'s own `*.js` files, sorted by name
 * so the output is stable across runs. A pure function of the directory it
 * is pointed at, so it can be exercised directly against the real engine
 * folder without going through this module's own `ENGINE_DIR`/import-time
 * wiring — the module-level `engineApiIndex` below is just this, called
 * once against `ENGINE_DIR` at import time.
 */
export function buildEngineApiIndex(engineDir: string): string {
  const files = readdirSync(engineDir)
    .filter((name) => name.endsWith(".js"))
    .sort()

  const sections = files
    .map((file) => renderFileSection(file, readFileSync(path.join(engineDir, file), "utf8")))
    .filter((section) => section.length > 0)

  return [HEADER, ...sections].join("\n\n")
}

/**
 * Computed once, at import time — the same instant `plan.ts`/`run-tasks.ts`
 * themselves are loaded — never per call: the engine's own source changes
 * only when this codebase is redeployed, not per game or per turn. Falls
 * back to just the header on a read failure (a missing or moved engine
 * folder) rather than throwing, since losing this one line of guidance
 * should never be what takes a chat turn down.
 */
export const engineApiIndex: string = (() => {
  try {
    return buildEngineApiIndex(ENGINE_DIR)
  } catch (error) {
    console.warn("Failed to build the engine API index", error)
    return HEADER
  }
})()
