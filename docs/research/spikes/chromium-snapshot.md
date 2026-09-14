# Spike: Daytona sandbox snapshot with headless Chromium

Gate for `agent-harness` task 5.0. Run on 2026-09-11 from a local dev machine,
against the real Daytona API with the project's `DAYTONA_API_KEY`.

## Verdict

**GO.** All six go/no-go criteria pass, most with margin. A Daytona snapshot
carrying Playwright + headless Chromium builds cleanly at 1.41 GiB, sandboxes
from it start no slower than today's (they measured *faster*, within normal
noise), the deterministic check runs well inside its latency budget on the
real Three.js game template, the SwiftShader screenshot is verifiably
non-blank, a seeded `pageerror` is caught, and it all ran in the default
1 GiB sandbox with no resize needed. The snapshot is kept —
`numa-chromium-game-2026-09-11T17-55` — for unit 5.3 to point
`DAYTONA_GAME_SNAPSHOT` at.

## Setup

- `@daytona/sdk` 0.211.2 (`apps/web/package.json`), against
  `apps/web/lib/daytona/client.ts`'s default `new Daytona()` (env-only config).
- First attempt at this spike, run earlier the same day, was **blocked**: the
  org's Daytona API key returned HTTP 403 "Access denied" on every
  `snapshot.create` call, including for the smallest possible image, while
  everything else (listing, plain sandbox create/delete, even a sandbox built
  from an ad-hoc `Image` with no named snapshot) worked. The user replaced the
  key in `apps/web/.env.local` with a full-access key; a minimal-image
  `snapshot.create` was re-confirmed working before this full run started.
- Image, matching decision 13 and task 5.1 (`Image.base().runCommands()`):

  ```ts
  Image.base("python:3.12-slim-bookworm").runCommands(
    "pip install --no-cache-dir playwright==1.49.1 Pillow==11.0.0",
    "playwright install --with-deps chromium",
    "rm -rf /var/lib/apt/lists/* /root/.cache/pip"
  )
  ```

  `Pillow` is spike-only — it computes pixel variance / unique-color counts
  on the screenshot in-sandbox for criterion 4. It is not part of the
  design's production script and does not need to ship in 5.1's real image.
  Base matches the default sandbox's toolbox language (python3, per
  `lib/daytona/utils.ts`'s `PORT_CHECK` comment), so the check script needs no
  extra runtime install.

  Playwright's `--with-deps` installer downloaded both full Chromium and
  Chromium Headless Shell, each **131.0.6778.33** (playwright build v1148).
  The check launches full `chromium`, not the headless shell, since the
  headless shell's WebGL/GPU support is less reliable.

  Snapshot resources: `{ cpu: 1, memory: 1, disk: 5 }` — 1 GiB doubles as the
  direct test for criterion 6, since a sandbox created from a named snapshot
  inherits the snapshot's own resources (`CreateSandboxFromSnapshotParams` has
  no `resources` field in the installed SDK).

  Snapshot built in **92.5 s**, size **1.41 GiB** (`snapshot.size` is in GiB —
  confirmed against the org's pre-existing default snapshot,
  `daytonaio/sandbox:0.9.0` at 6.85 GiB, seen in the snapshot list during the
  earlier blocked attempt).

- Baseline for "today's sandbox": `apps/web/lib/daytona/utils.ts`'s
  `createGameSandbox`, which calls `daytona.create({ labels })` with no
  `image`/`snapshot` — the org's default snapshot. The start-time comparison
  (criterion 2) times only the `daytona.create()` call itself for both arms:
  that isolates the one variable snapshot size can affect (sandbox
  provisioning), rather than folding in file-upload time, which is identical
  in both arms and unrelated to Chromium being present.
- Game template: `apps/web/lib/games/runtime/` (`readRuntimeSeed`), the real
  seed every game starts from — a genuine Three.js scene (`index.html`,
  `engine/`, vendored `three.module.min.js`, `SVGLoader`, bloom
  postprocessing, a particle field), not a stand-in. Not modified. Uploaded
  into the functional-test sandbox exactly as `createGameSandbox` uploads it,
  then served with the same `python3 -m http.server` + port-poll pattern as
  `startGameServer`.
- Check script (`spike-check.py`, uploaded into the sandbox, not committed):
  Playwright async Python, `chromium.launch(headless=True, args=[...])` with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist --disable-gpu-sandbox --no-sandbox`, navigates to
  `http://127.0.0.1:3000/index.html`, collects `console` (type `error`) and
  `pageerror` events, waits 2 s for the scene to render, takes a JPEG
  screenshot (quality 80), and (spike-only) computes unique-color count and
  pixel variance with Pillow. An `SEED_ERROR=1` env var makes it inject
  `setTimeout(() => { throw new Error('numa-spike-seeded-error') }, 100)` via
  `page.evaluate` before waiting — a `setTimeout`-deferred throw lands as a
  real uncaught exception (a `pageerror` event), not a rejected `evaluate()`
  call, matching what a bug in generated game code would look like.
- Scripts: throwaway `apps/web/spike-*.mts` (and one `spike-check.py`
  uploaded to the sandbox), run with `node --env-file=.env.local
  <script>.mts` from `apps/web`. All deleted after the run; none were
  committed.

## Results

| # | Criterion | Threshold | Measured | Pass/Fail |
|---|---|---|---|---|
| 1 | Snapshot builds, size | ≤ 2.5 GiB | Built in 92.5 s, **1.41 GiB** | **Pass** |
| 2 | Sandbox start vs today | ≤ 5 s slower (median of ≥ 3) | Baseline median **1332 ms** (1332, 1151, 1378); snapshot median **1200 ms** (916, 1200, 1305) — delta **−132 ms** (snapshot sandboxes started *faster*) | **Pass** |
| 3 | Check latency | p50 ≤ 15 s, p95 ≤ 30 s (≥ 5 runs) | 5 runs: 8193, 8485, 7989, 7981, 7592 ms → **p50 = 7989 ms**; sample too small for a real p95, so the max is reported as the proxy: **8485 ms** | **Pass** |
| 4 | Non-blank SwiftShader screenshot | Programmatic proof | **12,020 unique colors**, pixel variance **1712.4** (a blank/solid frame would read ~1 unique color, variance ~0); visual check confirms a rendered scene (extruded logo, bloom, starfield) | **Pass** |
| 5 | Seeded `pageerror` caught | Must appear in the check's findings | `pageErrors: ["numa-spike-seeded-error"]` | **Pass** |
| 6 | Runs in 1 GiB RAM | 1 GiB, else 2 GiB with cost accepted | Sandbox created from the snapshot inherited `memory = 1` GiB (the snapshot's own resource spec); all 6 check runs plus the seeded-error run completed inside it, no resize needed | **Pass (1 GiB, no fallback)** |

All 6/6 criteria pass. No criterion needed the 2 GiB fallback.

## Findings

1. The two-hour-old permission gap from the earlier attempt (`snapshot.create`
   returning 403 for every image) is fully resolved by the new key — the same
   minimal-image call that failed before now succeeds, confirmed before
   spending the full build.
2. Snapshot size (1.41 GiB) has real headroom under the 2.5 GiB cap — the
   Playwright + Chromium (full browser only counted toward the image;
   Headless Shell and ffmpeg are also cached by `playwright install
   --with-deps` but the total is still well under budget) footprint on a
   `python:3.12-slim-bookworm` base is smaller than the org's own default
   snapshot (6.85 GiB), so there's room to add more without approaching the
   limit.
3. Start-time delta was negative (snapshot sandboxes started faster than the
   baseline in this run). Six data points from one process in one session is
   not enough to call snapshot restore reliably faster than the default
   image — network and scheduler variance plausibly explains it — but it
   rules out any meaningful *regression*, which is what the criterion is
   actually gating.
4. Check latency (~8 s per run) has real margin against both the p50 (15 s)
   and p95 (30 s) budgets — roughly half. The dominant cost is Chromium
   launch + navigation + the fixed 2 s render wait, not variance run to run
   (7.6–8.5 s band across 5 runs).
5. The screenshot is unambiguously a rendered frame, not a blank canvas or
   the page's own no-WebGL fallback (`#fallback` shows a flat, undecorated
   logo per `index.html`'s `catch` path) — 12k+ unique colors and the visual
   check both confirm SwiftShader actually rasterized bloom, gradients, and
   a particle field.
6. No RAM pressure was observed at 1 GiB — Chromium plus the Python dev
   server ran comfortably inside the snapshot's default allocation across 6
   check invocations, so criterion 6 needed no `sandbox.resize()` fallback.

## Consequences for units 5.1–5.3 and 6

- **5.1** (`lib/daytona/game-image.ts`): the image definition above is ready
  to use verbatim, minus the spike-only `Pillow` line. Keep the base
  (`python:3.12-slim-bookworm`), the two `runCommands` calls, and the
  `apt`/`pip` cache cleanup.
- **5.2** (`build-game-snapshot.ts`): `snapshot.create({ image, resources: {
  cpu: 1, memory: 1, disk: 5 } })` works exactly as task 5.2 plans. Reuse the
  resource shape — 1 GiB memory is load-bearing for criterion 6 staying at
  1 GiB rather than needing the 2 GiB fallback.
- **5.3**: point `DAYTONA_GAME_SNAPSHOT` at **`numa-chromium-game-2026-09-11T17-55`**
  (kept, not deleted — see Cleanup). `createGameSandbox` can switch to it when
  the env var is set, per the gate's design.
- **Unit 6**: cleared to build for real, not `unavailable`-only. The check
  script's shape (Playwright launch args, console/pageerror collection,
  screenshot) is validated end to end against the actual game template; task
  6.1's fixed production script can follow the spike script's structure
  (minus `Pillow` and the `SEED_ERROR` test hook, which are spike-only). The
  8 s typical check latency leaves plenty of room inside task 6.3's 90 s + 60 s
  check budget.

## Limits

- Six sandbox-creation timings (3 baseline + 3 snapshot) and five check runs,
  all from one local process in one region in one session — enough to clear
  the stated thresholds with real margin, not enough to characterize
  variance under production load, concurrent verifies, or a different
  Daytona region.
- The p95 in criterion 3 is a max-of-5 proxy, as the brief allows for a small
  sample; it is not a statistically grounded 95th percentile.
- Only the shipped runtime template's own Three.js scene was exercised — a
  generated game with heavier geometry, more draw calls, or shader
  complexity could push latency or RAM usage higher than this spike saw.
- `Pillow`'s presence in the spike image (not the production one) means the
  spike's snapshot size is not exactly what 5.1/5.2 will produce; the
  production image should be marginally smaller, not larger.

## Cleanup

- Every sandbox this run created was deleted immediately after its use: 3
  baseline-timing sandboxes, 3 snapshot-timing sandboxes, and 1
  functional-test sandbox (used for the 5 latency runs, the screenshot, and
  the seeded-pageerror run), all deleted via `daytona.delete()` in a
  `try/finally`.
- Final sweep (`daytona.list()`) after the run showed exactly 4 sandboxes,
  all pre-existing production game sandboxes belonging to the user
  (`labels.gameId` set, `state: stopped`) — none carrying the `spike` label
  used by every sandbox this run created, and none touched.
- The snapshot **is kept** (verdict is GO):
  `numa-chromium-game-2026-09-11T17-55`, size 1.41 GiB, state `active`.
- All spike scripts (`apps/web/spike-build-snapshot.mts`, `spike-run.mts`,
  `spike-cleanup-check.mts`, `spike-check.py`) and their local byproducts
  (`spike-snapshot-info.json`, `spike-final-report.json`,
  `spike-screenshot.jpg`) were deleted; only this report was committed.
