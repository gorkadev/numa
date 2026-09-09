import type { Sandbox } from "@daytona/sdk"
import { tool, type ToolSet } from "ai"
import { z } from "zod"

import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

/**
 * Ceiling on what a single `read_file` may pull back.
 *
 * The content goes straight into the model's context, so an accidental read of
 * a large asset costs the conversation far more than it costs the sandbox. A
 * hand-written game file lives comfortably under this; anything above it is a
 * mistake worth reporting rather than paying for.
 */
const MAX_READ_BYTES = 256 * 1024

/**
 * How deep `list_files` may walk when the model does not say.
 *
 * A game is a handful of files in one or two directories, so two levels shows
 * the whole thing in one call without ever risking a walk into something like
 * a copied dependency tree.
 */
const DEFAULT_LIST_DEPTH = 2
const MAX_LIST_DEPTH = 5

/**
 * The characters a path inside the game directory may use.
 *
 * Deliberately narrower than what the filesystem accepts. Every path here is
 * chosen by a language model, so the set is limited to what a real game file
 * needs — letters, digits, dots, dashes, underscores and separators. Excluding
 * quotes, spaces, backslashes and shell metacharacters means no downstream
 * consumer of these paths has to think about escaping.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * The name the static server serves at the root of the preview.
 *
 * Named here as well as in the runtime instructions because this module is
 * what enforces it: the prompt tells the model that the game is this file,
 * `delete_file` is what makes that stay true.
 */
const ENTRY_FILE = "index.html"

/**
 * The parts of a game that are worth stopping the turn over.
 *
 * A closed set rather than free text, and asked for *before* the question, so
 * the model has to place its uncertainty somewhere real before it writes a
 * word of it. Left open, "ask the player" collapses into asking for
 * reassurance — "shall I continue?" — which costs the player a decision and
 * buys the game nothing. Naming the dimension first is what keeps the question
 * about the game.
 */
const ASK_DIMENSIONS = [
  "loop",
  "goal",
  "challenge",
  "controls",
  "world",
  "progression",
  "look",
  "feel",
  "audio",
] as const

/**
 * What each dimension covers, in the prompt itself.
 *
 * The enum values alone are ambiguous — "feel" and "look" are one thing to a
 * player and two to a designer — so the split is spelled out where the model
 * reads it rather than left to be guessed at.
 */
const ASK_DIMENSION_GUIDE = [
  "loop — the moment-to-moment action the player repeats",
  "goal — what winning is, and what ends a run",
  "challenge — what opposes the player, and how hard it pushes",
  "controls — the input scheme and how the player moves",
  "world — the setting, its layout and how much of it exists",
  "progression — what changes across a session: levels, unlocks, difficulty",
  "look — art direction, palette, camera framing",
  "feel — pacing, weight and tone: floaty or heavy, calm or frantic",
  "audio — music and sound effects",
].join("; ")

/**
 * What the player's answer looks like coming back from the browser.
 *
 * Written out rather than inferred from the schema below, because the inferred
 * form names types from packages this one does not depend on and TypeScript
 * will not emit it. Exported so the component that produces the answer and the
 * schema that validates it cannot drift apart silently.
 */
export type AskPlayerOutput = { optionId: string; label: string }

/**
 * What every tool in this module hands back on failure.
 *
 * A returned error, not a thrown one. A throw inside `execute` ends the step
 * and gives the model nothing to work with, while a result it can read is a
 * result it can correct: a typo'd path comes back as "no such file", and the
 * next tool call fixes it without the turn dying.
 */
type ToolError = { error: string }

const failed = (message: string): ToolError => ({ error: message })

/**
 * Turns a model-supplied relative path into an absolute one inside the game
 * directory, or explains why it will not.
 *
 * This is the containment boundary for every tool below. The sandbox is a
 * whole Linux machine and the model is holding file-write primitives against
 * it, so "stay in the game directory" cannot be a convention in the prompt —
 * a prompt is advice, and one confused turn is enough to overwrite a shell
 * profile or read a credential the sandbox happens to hold.
 *
 * The check is structural rather than a blocklist. Segments are validated one
 * at a time, `.` and `..` are rejected outright rather than resolved, and the
 * result is asserted to sit under `GAME_DIR` — so there is no traversal to
 * normalize away, no encoding to see through, and nothing to keep in sync with
 * a list of bad prefixes.
 *
 * Symbolic links are the one thing this cannot see: a link written inside the
 * directory could point outside it. That is acceptable because nothing in this
 * module creates links, and the sandbox is disposable and single-tenant.
 */
function resolveGamePath(
  input: string
): { path: string; relative: string } | ToolError {
  const relative = input.trim().replace(/^\.\//, "")

  if (relative.length === 0) {
    return failed("Path is empty. Give a path relative to the game directory.")
  }

  if (relative.startsWith("/") || relative.startsWith("~")) {
    return failed(
      `"${input}" is an absolute path. Paths are relative to the game directory, so write "index.html", not "${GAME_DIR}/index.html".`
    )
  }

  const segments = relative.split("/")

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return failed(
        `"${input}" walks outside the game directory. Everything you can reach lives under it, so a path never needs "." or "..".`
      )
    }

    if (!SAFE_SEGMENT.test(segment)) {
      return failed(
        `"${input}" is not a usable path. Use letters, digits, dots, dashes and underscores, with "/" between directories — no spaces.`
      )
    }
  }

  const path = `${GAME_DIR}/${segments.join("/")}`

  /**
   * Belt and braces. The segment rules above already make traversal
   * unrepresentable, but this is the invariant the rest of the module relies
   * on, so it is asserted rather than assumed.
   */
  if (!path.startsWith(`${GAME_DIR}/`)) {
    return failed(`"${input}" resolves outside the game directory.`)
  }

  return { path, relative: segments.join("/") }
}

const isError = (value: unknown): value is ToolError =>
  typeof value === "object" && value !== null && "error" in value

/**
 * Reduces whatever the sandbox threw into one line the model can act on.
 *
 * The SDK surfaces transport errors with stack traces and request ids attached
 * — useful in a log, noise in a context window, and occasionally a leak of
 * infrastructure detail into a conversation the user can read.
 */
const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Builds the file tools for one game.
 *
 * Bound to a `gameId` rather than a sandbox handle because a chat outlives any
 * single sandbox connection: turns are separated by minutes or days, and a
 * sandbox can idle into `stopped` in between. Resolving through
 * `getGameSandbox` on each call means a tool always acts on a live sandbox and
 * never on a stale reference from an earlier turn.
 */
export function createGameTools(gameId: string): ToolSet {
  const withSandbox = async <T>(
    run: (sandbox: Sandbox) => Promise<T>
  ): Promise<T | ToolError> => {
    try {
      const { sandbox } = await getGameSandbox(gameId)
      return await run(sandbox)
    } catch (cause) {
      return failed(describe(cause))
    }
  }

  return {
    /**
     * The one tool here with no `execute`, and no sandbox behind it.
     *
     * That absence is the mechanism, not an omission: when the model calls a
     * tool the SDK cannot run, `streamText` ends with the call left pending,
     * the run suspends, and nothing resumes until the player answers in the
     * UI. So this is not a question the model asks and then answers for
     * itself — the turn genuinely stops here.
     *
     * Because nothing on the server produces the result, the shape of that
     * result has to be declared: `outputSchema` is what types the answer the
     * client sends back and what the model reads on the next turn. Without
     * it the output is `unknown` on both ends.
     */
    ask_player: tool({
      description: [
        "Ask the player to choose between concrete directions for their game.",
        "The turn stops here and waits for their answer, so spend it on a decision that is genuinely theirs: what the game should be, not whether you may proceed.",
        "Ask when the request leaves a real fork open and the options would produce visibly different games. Do not ask for permission, for reassurance, or about anything you can decide yourself and change later.",
        "One question per call, always: the player answers, and their answer is what tells you which question is worth asking next. On the first message of a new game expect a short run of them, three or four, each following from the last — then build. Once the game is on screen, asking becomes rare, because a default they can react to beats a question they must answer before seeing anything.",
        "Never re-ask a dimension already settled, whether the player chose it here or described it themselves.",
      ].join(" "),
      inputSchema: z.object({
        /**
         * First in the object on purpose. The model fills these fields in
         * order as it streams, so choosing the area comes before writing the
         * question rather than being labelled onto one already written.
         */
        dimension: z
          .enum(ASK_DIMENSIONS)
          .describe(
            `The part of the game this decision is about. ${ASK_DIMENSION_GUIDE}.`
          ),
        question: z
          .string()
          .min(1)
          .describe(
            "The question, in one sentence, addressed to the player. Plain language about the game they will play — not implementation detail, file names or library choices."
          ),
        options: z
          .array(
            z.object({
              id: z
                .string()
                .min(1)
                .describe(
                  'Short stable identifier for this option, e.g. "top_down" or "side_on". Lowercase, no spaces.'
                ),
              label: z
                .string()
                .min(1)
                .describe(
                  "A few words naming the option, as it will read on a button."
                ),
              description: z
                .string()
                .min(1)
                .describe(
                  "One sentence on what picking this would mean for the game, in terms the player can feel rather than build notes."
                ),
            })
          )
          .min(2)
          .max(4)
          .describe(
            "Two to four options that genuinely differ. Every one must be something you are willing to build, and no two may be rewordings of the same game."
          ),
      }),
      /**
       * The player's choice, echoed back as both halves of the option. The id
       * is what the next turn should branch on; the label is there so the
       * transcript still reads as a conversation when the history is replayed
       * without the original option list in view.
       */
      outputSchema: z.object({
        optionId: z.string(),
        label: z.string(),
      }),
    }),

    read_file: tool({
      description:
        "Read a file from the game directory. Use it before editing a file you did not write this turn — the sandbox keeps files between turns, so what is on disk may not match what you remember.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Path relative to the game directory, e.g. "index.html" or "assets/level.json".'
          ),
      }),
      execute: async ({ path }) => {
        const resolved = resolveGamePath(path)

        if (isError(resolved)) {
          return resolved
        }

        return withSandbox(async (sandbox) => {
          const details = await sandbox.fs.getFileDetails(resolved.path)

          if (details.isDir) {
            return failed(
              `"${resolved.relative}" is a directory. Use list_files to see what is in it.`
            )
          }

          if (details.size > MAX_READ_BYTES) {
            return failed(
              `"${resolved.relative}" is ${details.size} bytes, over the ${MAX_READ_BYTES} byte read limit. Read a smaller file, or replace it wholesale with write_file.`
            )
          }

          const bytes = await sandbox.fs.downloadFile(resolved.path)
          const content = bytes.toString("utf-8")

          if (content.includes("\u0000")) {
            return failed(
              `"${resolved.relative}" is a binary file and cannot be read as text.`
            )
          }

          return { path: resolved.relative, content }
        })
      },
    }),

    list_files: tool({
      description:
        "List what is in the game directory. Call it at the start of a turn when you are not certain what the game is currently made of.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(
            "Subdirectory to list, relative to the game directory. Omit to list the game directory itself."
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIST_DEPTH)
          .optional()
          .describe(
            `How many levels deep to walk. Defaults to ${DEFAULT_LIST_DEPTH}.`
          ),
      }),
      execute: async ({ path, depth }) => {
        const resolved = path ? resolveGamePath(path) : null

        if (resolved && isError(resolved)) {
          return resolved
        }

        const target = resolved ? resolved.path : GAME_DIR

        return withSandbox(async (sandbox) => {
          const entries = await sandbox.fs.listFiles(target, {
            depth: depth ?? DEFAULT_LIST_DEPTH,
          })

          return {
            path: resolved ? resolved.relative : ".",
            files: entries.map((entry) => ({
              /**
               * Reported relative to the game directory, matching what the
               * tools accept as input. Handing back an absolute sandbox path
               * would invite the model to feed it straight back and be told
               * off by `resolveGamePath`.
               */
              path: (entry.path ?? `${target}/${entry.name}`).slice(
                GAME_DIR.length + 1
              ),
              type: entry.isDir ? ("directory" as const) : ("file" as const),
              size: entry.isDir ? undefined : entry.size,
            })),
          }
        })
      },
    }),

    write_file: tool({
      description:
        "Write a file in the game directory, creating it or replacing it whole. Missing parent directories are created. Use it for new files and for rewrites; use replace_text for a small edit to a large file.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Path relative to the game directory, e.g. "index.html" or "assets/level.json".'
          ),
        content: z
          .string()
          .describe(
            "The complete new contents of the file. Not a patch, not a fragment — whatever is here is exactly what the file becomes."
          ),
      }),
      execute: async ({ path, content }) => {
        const resolved = resolveGamePath(path)

        if (isError(resolved)) {
          return resolved
        }

        return withSandbox(async (sandbox) => {
          const parent = resolved.path.slice(0, resolved.path.lastIndexOf("/"))

          if (parent !== GAME_DIR) {
            /**
             * Creating a folder that already exists is not an error worth
             * surfacing: the write that follows is the operation the model
             * asked for, and it reports its own failures with better context.
             */
            await sandbox.fs.createFolder(parent, "755").catch(() => {})
          }

          await sandbox.fs.uploadFile(
            Buffer.from(content, "utf-8"),
            resolved.path
          )

          return {
            path: resolved.relative,
            bytes: Buffer.byteLength(content, "utf-8"),
          }
        })
      },
    }),

    replace_text: tool({
      description:
        "Replace an exact run of text in a file. Cheaper than rewriting a whole file for a small change. The text you give must appear exactly as it does on disk, so read the file first unless you wrote it this turn.",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the game directory."),
        oldText: z
          .string()
          .min(1)
          .describe(
            "The exact text to replace, whitespace and indentation included. Include enough surrounding lines to make it appear only once in the file."
          ),
        newText: z
          .string()
          .describe("The text to put in its place. Empty to delete it."),
        replaceAll: z
          .boolean()
          .optional()
          .describe(
            "Replace every occurrence instead of failing when the text is not unique. Defaults to false."
          ),
      }),
      execute: async ({ path, oldText, newText, replaceAll = false }) => {
        const resolved = resolveGamePath(path)

        if (isError(resolved)) {
          return resolved
        }

        return withSandbox(async (sandbox) => {
          const details = await sandbox.fs.getFileDetails(resolved.path)

          if (details.isDir) {
            return failed(`"${resolved.relative}" is a directory, not a file.`)
          }

          if (details.size > MAX_READ_BYTES) {
            return failed(
              `"${resolved.relative}" is ${details.size} bytes, over the ${MAX_READ_BYTES} byte limit for an edit. Rewrite it with write_file instead.`
            )
          }

          const original = (
            await sandbox.fs.downloadFile(resolved.path)
          ).toString("utf-8")

          /**
           * Counted before replacing, so "not found" and "ambiguous" are two
           * different answers. A replace that silently hit the wrong one of
           * five identical lines is the failure mode this whole tool exists to
           * avoid, and the model can only widen its context if it is told.
           */
          const occurrences = original.split(oldText).length - 1

          if (occurrences === 0) {
            return failed(
              `That text does not appear in "${resolved.relative}". Read the file and copy the text exactly, including indentation.`
            )
          }

          if (occurrences > 1 && !replaceAll) {
            return failed(
              `That text appears ${occurrences} times in "${resolved.relative}". Include more surrounding lines so it matches once, or pass replaceAll to change every occurrence.`
            )
          }

          const updated = replaceAll
            ? original.split(oldText).join(newText)
            : original.replace(oldText, newText)

          await sandbox.fs.uploadFile(
            Buffer.from(updated, "utf-8"),
            resolved.path
          )

          return { path: resolved.relative, replacements: occurrences }
        })
      },
    }),

    delete_file: tool({
      description:
        "Delete a file or directory from the game directory. Only for files the game genuinely no longer uses — replacing a file's contents is write_file's job, not a delete followed by a write.",
      inputSchema: z.object({
        path: z.string().describe("Path relative to the game directory."),
      }),
      execute: async ({ path }) => {
        const resolved = resolveGamePath(path)

        if (isError(resolved)) {
          return resolved
        }

        /**
         * The entry file is the game as far as the player is concerned, and
         * the static server has nothing to fall back on. Deleting it would
         * blank the preview until some later turn happened to recreate it, so
         * the one legal way to change it is to overwrite it.
         */
        if (resolved.relative === ENTRY_FILE) {
          return failed(
            `"${ENTRY_FILE}" is what the player loads and cannot be deleted. Overwrite it with write_file instead.`
          )
        }

        return withSandbox(async (sandbox) => {
          const details = await sandbox.fs.getFileDetails(resolved.path)

          await sandbox.fs.deleteFile(resolved.path, details.isDir)

          return {
            path: resolved.relative,
            deleted: details.isDir ? ("directory" as const) : ("file" as const),
          }
        })
      },
    }),
  }
}
