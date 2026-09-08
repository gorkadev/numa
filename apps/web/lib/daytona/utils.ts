import type { Sandbox } from "@daytona/sdk"
import { db } from "@workspace/db"
import { games } from "@workspace/db/schema"
import { eq } from "drizzle-orm"

import { daytona } from "./client"

/**
 * The shape every sandbox helper here resolves to.
 *
 * An object rather than the bare `Sandbox` so each helper can grow a second
 * piece of context — a preview URL, a freshly-created flag — without breaking
 * its callers, and so all of them read the same at every call site.
 */
export type SandboxResult = { sandbox: Sandbox }

/**
 * Where the generated game lives inside the sandbox. Daytona's default user is
 * `daytona`, so this is that user's home — writable without escalation, and the
 * directory a preview server would be pointed at later.
 */
export const GAME_DIR = "/home/daytona/game"
const INDEX_PATH = `${GAME_DIR}/index.html`

/**
 * Provisions the sandbox that will host one game and records it on the row.
 *
 * Called once per game, from the chat agent's `onChatStart`. The seed document
 * exists so the sandbox is servable from the very first moment: an empty
 * directory would make a preview URL 404 until the model produced its first
 * file, and "not built yet" is a much worse signal than a placeholder page.
 *
 * The sandbox id is written last, after the seed lands. That ordering is what
 * makes a null `sandboxId` mean "no usable sandbox": persisting the id first
 * would leave a half-provisioned sandbox indistinguishable from a ready one if
 * the upload failed.
 *
 * The freshly created sandbox is returned, not just its id, so a caller that
 * needs to work with it immediately does not pay a `daytona.get` round trip to
 * fetch back what it just made.
 */
export async function createGameSandbox(
  gameId: string
): Promise<SandboxResult> {
  const sandbox = await daytona.create()

  await sandbox.fs.createFolder(GAME_DIR, "755")
  await sandbox.fs.uploadFile(Buffer.from("New Game"), INDEX_PATH)

  await db
    .update(games)
    .set({ sandboxId: sandbox.id })
    .where(eq(games.id, gameId))

  return { sandbox }
}

/**
 * Brings a sandbox to the `started` state, or refuses.
 *
 * A stopped sandbox keeps its disk but not its processes, so it is resumable
 * and worth waiting on. Anything else (destroyed, error, archived, unknown) is
 * a state no caller can work around by trying harder, so it fails loudly rather
 * than handing back a sandbox whose every subsequent call would error.
 */
async function resumeSandbox(sandbox: Sandbox): Promise<SandboxResult> {
  if (sandbox.state === "stopped") {
    await sandbox.start()
  } else if (sandbox.state !== "started") {
    throw new Error(
      `Sandbox ${sandbox.id} is ${sandbox.state ?? "in an unknown state"}`
    )
  }

  return { sandbox }
}

/**
 * Hands back a running sandbox for a game, creating one if the game has none.
 *
 * This is the entry point for the chat agent's tools. A tool cannot reason
 * about provisioning: `onChatStart` normally mints the sandbox before the first
 * turn, but a run that failed there, a game created before sandboxes existed,
 * or a sandbox that idled into `stopped` would each leave a tool holding
 * nothing usable. Folding "look it up, create it if missing, start it if
 * asleep" into one call means every tool can assume a live sandbox and spend
 * its own code on the actual work.
 *
 * A missing game row throws instead of provisioning: creating a sandbox for an
 * id that does not exist would leak a sandbox no row will ever point at.
 */
export async function getGameSandbox(gameId: string): Promise<SandboxResult> {
  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) {
    throw new Error(`Game ${gameId} does not exist`)
  }

  if (!game.sandboxId) {
    return createGameSandbox(gameId)
  }

  return resumeSandbox(await daytona.get(game.sandboxId))
}

/**
 * Port the game's static server listens on inside the sandbox. Nothing else in
 * the sandbox is expected to bind it, which is what makes "something answers on
 * this port" a sufficient health check.
 */
export const GAME_PORT = 3000

/**
 * Exit 0 when the port is already accepting connections. Written in Python
 * rather than with `curl`, because the default sandbox image is the Python one
 * and `python3` is the only interpreter guaranteed to be there.
 */
const PORT_CHECK = `python3 -c "import socket,sys; s=socket.socket(); s.settimeout(1); sys.exit(s.connect_ex(('127.0.0.1',${GAME_PORT})))"`

/**
 * Ensures a static file server is serving the game directory, then hands back
 * the running sandbox.
 *
 * This is called on every preview request, so the health check comes first and
 * the spawn only happens when the port is dead. Starting a second server on
 * each request would either fail on the bound port or pile up orphan processes
 * — neither of which the caller could tell apart from success.
 *
 * The retry loop runs inside the sandbox, as one command, because polling from
 * here would pay a full API round trip per attempt for a server that usually
 * comes up in well under a second.
 *
 * The sandbox is returned rather than a preview URL: minting a link is the
 * caller's concern, and the caller is the one that knows whether it needs one
 * at all.
 */
export async function startGameServer(
  sandboxId: string
): Promise<SandboxResult> {
  const { sandbox } = await resumeSandbox(await daytona.get(sandboxId))

  const healthy = await sandbox.process.executeCommand(PORT_CHECK)

  if (healthy.exitCode !== 0) {
    /**
     * `nohup` plus the redirects detach the server from this command, so the
     * exec returns instead of blocking for the lifetime of the server.
     */
    await sandbox.process.executeCommand(
      `nohup python3 -m http.server ${GAME_PORT} --directory ${GAME_DIR} > /tmp/game-server.log 2>&1 < /dev/null &`
    )

    const ready = await sandbox.process.executeCommand(
      `for i in $(seq 1 40); do ${PORT_CHECK} && exit 0; sleep 0.25; done; exit 1`,
      undefined,
      undefined,
      30
    )

    if (ready.exitCode !== 0) {
      throw new Error(
        `Game server did not start in sandbox ${sandboxId}: ${ready.result}`
      )
    }
  }

  return { sandbox }
}
