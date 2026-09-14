/**
 * The verify check's fixed Python source, and the constants that shape it.
 *
 * "Fixed" is load-bearing (design.md's Threat Matrix note, task 6.1): this
 * string never has model output, player text, or any other untrusted value
 * interpolated into it — every per-call input (the port, the console-error
 * baseline, where to read/write inside the sandbox) crosses into the script
 * as an environment variable at `process.executeCommand` time
 * (`lib/daytona/verify.ts`), the same pattern the unit 5 spike's own
 * `SEED_ERROR` env var already validated. The script's bytes on disk are
 * identical on every call, for every game, forever — there is nothing here
 * for a player's message to ever reach.
 *
 * Uploaded from this repo constant to a path OUTSIDE `GAME_DIR`
 * (`VERIFY_SCRIPT_PATH` below), so neither the orchestrator's own write
 * tools nor a scoped worker's (both confined to `GAME_DIR`) can ever read,
 * overwrite or delete it — matching the Threat Matrix note verbatim.
 */

/**
 * Combined cap on how many console errors one run reports, across both
 * categories (new and pre-existing) together — design.md's Threat Matrix
 * note: "the output is parsed JSON capped at 20 errors of 300 chars each."
 */
export const MAX_CONSOLE_ERRORS = 20

/** Per-error character cap, applied before an error is placed in either category. */
export const MAX_ERROR_CHARS = 300

/**
 * How long the script waits, after navigation, before taking the screenshot
 * and reading back whatever console/page errors have fired by then. Matches
 * the unit 5 spike's own script, which used the same fixed wait and passed
 * every latency criterion with room to spare (`docs/research/spikes/chromium-snapshot.md`).
 */
const RENDER_WAIT_SECONDS = 2

/**
 * Where the script lives inside the sandbox — a fixed absolute path under
 * the Daytona default user's home, well outside `GAME_DIR`
 * (`lib/daytona/utils.ts`'s `/home/daytona/game`), so it shares no directory
 * a game-scoped write tool could ever resolve into.
 */
export const VERIFY_SCRIPT_PATH = "/home/daytona/numa-verify-check.py"

/**
 * Chromium launch flags validated end to end by the unit 5 spike: SwiftShader
 * software rendering, no sandbox (already running inside one). Full
 * `chromium`, not Playwright's Headless Shell — the spike's own note: the
 * shell's WebGL/GPU support is less reliable.
 */
const CHROMIUM_ARGS = `[
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-gpu-sandbox",
    "--no-sandbox",
]`

/**
 * The whole check, in one process: launch headless Chromium, load the game,
 * collect console errors and uncaught page errors, screenshot the result,
 * diff against the baseline it was handed, and leave the sandbox's own
 * `.numa/verify/last.json` holding this run's full error list for whichever
 * call — this turn's retry, or a future turn's first check — reads it next.
 *
 * Every dynamic input arrives through `os.environ`, never through string
 * formatting into this source: `VERIFY_GAME_PORT` (the port the game's
 * static server listens on, `lib/daytona/utils.ts`'s `GAME_PORT`),
 * `VERIFY_BASELINE_JSON` (a JSON array of the console-error strings the
 * calling turn started from — `harness/turn-state.ts`'s frozen
 * `verifyBaseline`, not necessarily whatever this sandbox's own
 * `last.json` currently holds), `VERIFY_LAST_JSON_PATH` and
 * `VERIFY_SCREENSHOT_PATH` (both absolute, inside `GAME_DIR`, under
 * `.numa/verify/` — a path only harness code ever writes to, per design.md
 * decision 7/11).
 *
 * Exit 0 means the check RAN, whatever it found — a turn-caused console
 * error is a normal, successful run. A non-zero exit means the check itself
 * could not complete (Chromium failed to launch, navigation never resolved,
 * or any other unexpected exception) — `lib/daytona/verify.ts` reads that as
 * `status: "unavailable"`, never as a failed game.
 */
export const VERIFY_SCRIPT_PY = `import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

MAX_ERRORS = ${MAX_CONSOLE_ERRORS}
MAX_ERROR_CHARS = ${MAX_ERROR_CHARS}
RENDER_WAIT_SECONDS = ${RENDER_WAIT_SECONDS}

GAME_PORT = os.environ.get("VERIFY_GAME_PORT", "3000")
GAME_URL = "http://127.0.0.1:" + GAME_PORT + "/index.html"
LAST_JSON_PATH = os.environ["VERIFY_LAST_JSON_PATH"]
SCREENSHOT_PATH = os.environ["VERIFY_SCREENSHOT_PATH"]

CHROMIUM_ARGS = ${CHROMIUM_ARGS}


def cap(message):
    return str(message)[:MAX_ERROR_CHARS]


async def main():
    baseline = set(json.loads(os.environ.get("VERIFY_BASELINE_JSON", "[]")))
    current = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        page = await browser.new_page()

        def on_console(message):
            if message.type == "error":
                current.append(cap(message.text))

        def on_page_error(error):
            current.append(cap(error))

        page.on("console", on_console)
        page.on("pageerror", on_page_error)

        await page.goto(GAME_URL, wait_until="load")
        await asyncio.sleep(RENDER_WAIT_SECONDS)

        os.makedirs(os.path.dirname(SCREENSHOT_PATH), exist_ok=True)
        await page.screenshot(path=SCREENSHOT_PATH, type="jpeg", quality=80)

        await browser.close()

    current = current[:MAX_ERRORS]
    new_errors = [message for message in current if message not in baseline]
    pre_existing = [message for message in current if message in baseline]

    os.makedirs(os.path.dirname(LAST_JSON_PATH), exist_ok=True)
    with open(LAST_JSON_PATH, "w") as handle:
        json.dump(current, handle)

    print(json.dumps({
        "newErrors": new_errors,
        "preExisting": pre_existing,
    }))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
`
