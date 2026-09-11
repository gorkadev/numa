# Spike: Daytona sandbox snapshot with headless Chromium

Gate for `agent-harness` task 5.0. Run on 2026-09-11 from a local dev machine,
against the real Daytona API with the project's `DAYTONA_API_KEY`.

## Verdict

**Blocked, not disproven.** The organization's Daytona API key cannot create a
named Snapshot at all — every `snapshot.create` call returns HTTP 403 "Access
denied", including for the smallest possible image (`python:3.12-slim-bookworm`
with zero added commands). The same key can list sandboxes, list snapshots,
create and delete an ordinary sandbox, and even create a sandbox directly from
a custom `Image` (Daytona's dynamic per-sandbox image build). Only registering
a reusable named snapshot is refused. None of the six go/no-go criteria could
be measured, because units 5.2 and 6 both depend on a named snapshot existing
(`DAYTONA_GAME_SNAPSHOT` points at a snapshot name, not an ad-hoc image).
Unit 6 ships `unavailable`-only, as the gate's fallback says, until this is
resolved and the spike re-run.

## Setup

- `@daytona/sdk` 0.211.2 (`apps/web/package.json`), against
  `apps/web/lib/daytona/client.ts`'s default `new Daytona()` (env-only config).
- Intended image, matching decision 13 and task 5.1 (`Image.base().runCommands()`):

  ```ts
  Image.base("python:3.12-slim-bookworm").runCommands(
    "pip install --no-cache-dir playwright==1.49.1",
    "playwright install --with-deps chromium",
    "rm -rf /var/lib/apt/lists/* /root/.cache/pip"
  )
  ```

  Intended snapshot resources: `{ cpu: 1, memory: 1, disk: 5 }` (task 5.3
  wants the check to run in 1 GiB RAM; disk headroom for the browser + OS
  deps). This image was never built — see Findings.
- Baseline for "today's sandbox": `apps/web/lib/daytona/utils.ts`'s
  `createGameSandbox`, which calls `daytona.create({ labels })` with no
  `image`/`snapshot` (the org's default snapshot, confirmed present —
  `daytonaio/sandbox:0.9.0`, 6.85 GiB, in the snapshot list below).
- Game template: `apps/web/lib/games/runtime/` (`readRuntimeSeed`), the real
  seed every game starts from — a Three.js scene (`index.html`, `engine/`,
  vendored `three.module.min.js` + `OrbitControls`/postprocessing addons),
  not a stand-in. Not modified.
- Scripts: throwaway `apps/web/spike-*.mts`, run with
  `node --env-file=.env.local <script>.mts` from `apps/web`. All deleted
  after the run (see Cleanup below); none were committed.

## Results

| # | Criterion | Measured | Pass/Fail |
|---|---|---|---|
| 1 | Snapshot builds, ≤ 2.5 GiB | Never built — `snapshot.create` returns 403 for every attempt | **Not measurable** |
| 2 | Sandbox start ≤ 5 s slower than today | Not measured (no snapshot to start from) | **Not measurable** |
| 3 | Check latency p50 ≤ 15 s / p95 ≤ 30 s | Not measured (no Chromium sandbox to run it in) | **Not measurable** |
| 4 | Non-blank SwiftShader screenshot | Not measured | **Not measurable** |
| 5 | Seeded `pageerror` is caught | Not measured | **Not measurable** |
| 6 | Check runs in 1 GiB RAM | Not measured | **Not measurable** |

No criterion could be evaluated because the one thing every one of them
depends on — a built, named snapshot — could not be produced.

## Findings

1. `daytona.snapshot.create({ name, image, resources })` fails with
   `DaytonaAuthorizationError: Access denied` (HTTP 403, body
   `{"error":"Forbidden","message":"Access denied"}`) on every attempt, with
   no further reason given. This reproduced twice: once for the intended
   Playwright/Chromium image, once for the minimal possible image
   (`Image.base("python:3.12-slim-bookworm")`, no `runCommands` at all). A
   raw `POST /api/snapshots` with a hand-built `buildInfo.dockerfileContent`
   (bypassing the SDK entirely) got the identical 403, ruling out an SDK-side
   request-shaping bug.
2. The same key succeeds at everything else tried: `daytona.list()` (sandbox
   listing), `daytona.snapshot.list()` (13 existing org snapshots, all
   pre-built platform images — `daytona-small`, `daytona-vm-small`,
   `daytonaio/sandbox:0.9.0`, Windows variants, etc. — none created by this
   project), `daytona.create({ labels })` (today's default-image sandbox,
   created and deleted cleanly), and — the sharpest signal —
   `daytona.create({ image: Image.base(...) })`. That last one *does* build a
   custom image and boot a sandbox from it; it just doesn't register a
   reusable named **Snapshot**. So the gap is specifically "create a named
   Snapshot resource," not "build a custom image" in general.
3. A different, unrelated 403 (`GET /api/api-keys/`) came back with a
   specific, descriptive message: *"Managing API keys with an API key is not
   enabled for this organization."* The snapshot endpoint's bare "Access
   denied" is a different failure shape (no reason given), which suggests
   it's a distinct restriction rather than the same class of "some actions
   need JWT auth, not an API key" limitation.
4. Taken together, this reads as either an organization-tier gate on
   persisting custom snapshots (separate from the network-tier gate the
   Daytona skill documents) or an API-key permission scope that excludes
   `snapshot:create` specifically. Nothing in the reachable API surface
   names which.

## Consequences for units 5.1–5.3 and 6

- **5.1** (`lib/daytona/game-image.ts`) can still be written — the `Image`
  definition above doesn't depend on this working and was confirmed to
  produce a bootable sandbox via `daytona.create({ image })`. It just can't
  be snapshotted yet.
- **5.2** (`build-game-snapshot.ts`) cannot ship as working until this is
  resolved: the script's one job is `snapshot.create({ image })`, and that
  call is what's blocked.
- **5.3** (`createGameSandbox` reading `DAYTONA_GAME_SNAPSHOT`) has nothing
  to point at. Per the gate, it stays off — `createGameSandbox` keeps using
  today's default-image path unconditionally.
- **Unit 6** (verify role) ships `unavailable`-only, per task 5.0's own
  fallback clause. The Python check script itself (task 6.1) is independent
  of the snapshot question and could still be written and unit-tested
  locally with a plain `playwright` install, but nothing in the harness can
  invoke it inside a sandbox until 5.2/5.3 land.
- Before re-running this spike: get the org's snapshot-creation permission
  fixed (support ticket or dashboard-side API key scope change is the
  likely fix — this was not something reachable from the API itself), then
  re-run. The image definition and resource shape above are ready to reuse
  verbatim; only the permission gap needs to close.

## Limits

- The blocker was confirmed against `snapshot.create` specifically; the
  investigation did not have access to the organization's dashboard or a
  JWT-authenticated session, so the exact cause (tier, billing, explicit
  scope) could not be confirmed from outside the API. `GET /api/organizations`
  and `GET /api/limits` both require auth this API key doesn't have (401 or
  404), so they couldn't help narrow it further.
- Nothing about performance, size, or correctness was learned — this is a
  pure access finding, not a signal on whether the design's approach would
  pass or fail once the permission issue is fixed.

## Cleanup

- Sandboxes created during diagnosis (a default-image sandbox, an
  ad-hoc-image sandbox) were deleted immediately after each check, in the
  same script run.
- A final sweep (`daytona.list()`) showed 4 remaining sandboxes, all
  pre-existing production game sandboxes (`labels.gameId` set, `state:
  stopped`) unrelated to this spike — none carried the `spike` label used
  by every sandbox this run created.
- `daytona.snapshot.list()` after the run showed 0 snapshots with "spike" in
  the name — none were registered (consistent with every `snapshot.create`
  call failing).
- All six throwaway `apps/web/spike-*.mts` scripts were deleted.
