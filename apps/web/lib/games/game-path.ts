/**
 * The game directory and the containment check every reader of it shares.
 *
 * Kept free of the sandbox client and the database so the rule can be used —
 * and tested — anywhere a path inside the game directory is handled: the
 * agent's tools, the harness and the Files tab's route handlers.
 */

/**
 * Where the generated game lives inside the sandbox. Daytona's default user is
 * `daytona`, so this is that user's home — writable without escalation, and the
 * directory a preview server would be pointed at later.
 */
export const GAME_DIR = "/home/daytona/game"

/**
 * Port the game's static server listens on inside the sandbox. Nothing else in
 * the sandbox is expected to bind it, which is what makes "something answers on
 * this port" a sufficient health check.
 */
export const GAME_PORT = 3000

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
 * What every tool in this module hands back on failure.
 *
 * A returned error, not a thrown one. A throw inside `execute` ends the step
 * and gives the model nothing to work with, while a result it can read is a
 * result it can correct: a typo'd path comes back as "no such file", and the
 * next tool call fixes it without the turn dying.
 */
export type ToolError = { error: string }

export const failed = (message: string): ToolError => ({ error: message })

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
 *
 * Exported so `harness/ownership.ts` and any future caller reason about a
 * model-supplied path the exact same way the unscoped tools do, rather than
 * re-implementing this containment check.
 */
export function resolveGamePath(
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
