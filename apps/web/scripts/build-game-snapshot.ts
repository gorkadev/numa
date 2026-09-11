import { daytona } from "../lib/daytona/client.ts"
import { gameSnapshotImage } from "../lib/daytona/game-image.ts"

/**
 * Builds the game-verification Daytona snapshot and prints its name.
 *
 * Run manually with `pnpm snapshot:build` (from `apps/web`) — never as part
 * of a deploy or CI step. A Daytona snapshot is built from an image
 * definition, not restored from a git ref, so nothing about the repo's own
 * build pipeline should trigger a rebuild; rerun this only when
 * `game-image.ts` changes (a Playwright version bump, an added package) and
 * a fresh snapshot is actually wanted. `unit 5.3`'s `createGameSandbox` never
 * calls this — it only reads the snapshot name this script prints, from
 * `DAYTONA_GAME_SNAPSHOT`.
 *
 * Imports are relative with an explicit `.ts` extension, not the `@/*`
 * alias the rest of the app uses: this file runs under plain `node`, whose
 * native TypeScript type-stripping (Node 26, no `tsx`/`ts-node` in this
 * project) strips types but does not resolve `tsconfig.json` path mappings
 * — those are a bundler/`tsc` feature, not a Node module-resolution one —
 * and Node's own ESM resolver needs the literal extension on a relative
 * specifier, unlike a bundler's extension-less convention. `tsconfig.json`
 * enables `allowImportingTsExtensions` (requires `noEmit`, already set) so
 * `tsc --noEmit` accepts it too.
 */
async function main(): Promise<void> {
  const name = snapshotName()

  console.log(`Building snapshot "${name}"...`)

  const snapshot = await daytona.snapshot.create({
    name,
    image: gameSnapshotImage,
    /**
     * Matches the spike's own resource spec (`docs/research/spikes/
     * chromium-snapshot.md`). `CreateSandboxFromSnapshotParams` has no
     * `resources` field in the installed `@daytona/sdk` (0.211.2), so every
     * sandbox created from this snapshot inherits these exact values —
     * `memory: 1` is load-bearing: the spike confirmed Chromium plus the
     * Python dev server fit the default 1 GiB with no resize fallback
     * needed.
     */
    resources: { cpu: 1, memory: 1, disk: 5 },
  })

  console.log(
    `Snapshot "${snapshot.name}" is ${snapshot.state} (${snapshot.size} GiB).`
  )
  console.log(`Set DAYTONA_GAME_SNAPSHOT=${snapshot.name} to use it.`)
}

/**
 * `numa-chromium-game-<UTC minute timestamp>`, matching the naming the unit
 * 5 spike used by hand (`numa-chromium-game-2026-09-11T17-55`) — a fresh,
 * sortable, human-readable name per build, so an old snapshot is never
 * silently overwritten by a new one.
 */
function snapshotName(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, "-")
  return `numa-chromium-game-${stamp}`
}

main().catch((error: unknown) => {
  console.error(
    "Snapshot build failed:",
    error instanceof Error ? error.message : String(error)
  )
  process.exitCode = 1
})
