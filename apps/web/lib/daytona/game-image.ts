import { Image } from "@daytona/sdk"

/**
 * Playwright's pinned version for the game-verification snapshot.
 *
 * Pinned, not left to float, so rebuilding the snapshot
 * (`scripts/build-game-snapshot.ts`) reproduces the same browser build until
 * this is bumped on purpose — `playwright install --with-deps` resolves
 * whichever Chromium revision matches the pip-installed Playwright version,
 * so pinning one pins both. Confirmed against
 * `docs/research/spikes/chromium-snapshot.md`: this exact version built
 * Chromium 131.0.6778.33 (Playwright build v1148).
 */
export const PLAYWRIGHT_VERSION = "1.49.1"

/**
 * The Daytona snapshot image `scripts/build-game-snapshot.ts` builds from: a
 * Python base with Playwright's full Chromium browser installed.
 *
 * Python, not Node, so the base matches the default sandbox's own toolbox
 * language — `lib/daytona/utils.ts`'s `PORT_CHECK` comment notes `python3` is
 * the one interpreter guaranteed to be there, and unit 6's verify script
 * (Playwright Python) needs no extra runtime install as a result.
 *
 * `playwright install --with-deps chromium` fetches both full Chromium and
 * Playwright's Headless Shell; unit 6's verify script launches full
 * `chromium`, not the shell, because its WebGL/GPU support under SwiftShader
 * is less reliable. The Chromium launch flags themselves
 * (`--use-gl=angle`, `--enable-unsafe-swiftshader`, etc.) belong to that
 * script, not here — this file only defines what gets baked into the
 * snapshot. `apt`/`pip` caches are cleared in the same layer so they never
 * inflate the built snapshot's size.
 *
 * Validated end to end by the unit 5 spike
 * (`docs/research/spikes/chromium-snapshot.md`): built cleanly at 1.41 GiB
 * (well under the 2.5 GiB go/no-go cap), and every later criterion —
 * sandbox start time, check latency, a non-blank SwiftShader screenshot, a
 * caught seeded `pageerror` — passed against a sandbox created from it. The
 * spike's own image also installed `Pillow` to measure the screenshot
 * in-sandbox; that was spike-only tooling and is intentionally not part of
 * this shipped image.
 */
export const gameSnapshotImage = Image.base(
  "python:3.12-slim-bookworm"
).runCommands(
  `pip install --no-cache-dir playwright==${PLAYWRIGHT_VERSION}`,
  "playwright install --with-deps chromium",
  "rm -rf /var/lib/apt/lists/* /root/.cache/pip"
)
