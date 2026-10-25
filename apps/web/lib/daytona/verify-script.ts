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
 * Below this share of the viewport covered by the page's largest canvas, a
 * template game is reported as not visible. A centred fixed-size canvas still
 * clears it easily; one pushed below a full-height `#app` covers none.
 */
export const MIN_CANVAS_VIEWPORT_SHARE = 0.25

/**
 * Evaluated in the page: the largest share of the viewport any canvas covers,
 * or `null` when there is no canvas. Readiness flags and a clean console say
 * nothing about whether the scene is on screen — a real run reported ready,
 * passed every check, and showed the player only `#app`'s background.
 */
export const CANVAS_VIEWPORT_SHARE_JS = `() => {
  const canvases = Array.from(document.querySelectorAll("canvas"))
  if (canvases.length === 0) return null
  let best = 0
  for (const canvas of canvases) {
    const r = canvas.getBoundingClientRect()
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0))
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
    best = Math.max(best, (w * h) / (innerWidth * innerHeight))
  }
  return best
}`

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
from urllib.parse import urlparse

from playwright.async_api import async_playwright

MAX_ERRORS = ${MAX_CONSOLE_ERRORS}
MAX_ERROR_CHARS = ${MAX_ERROR_CHARS}
RENDER_WAIT_SECONDS = ${RENDER_WAIT_SECONDS}
INITIAL_READY_TIMEOUT_SECONDS = 20
ADAPTER_ASSERTION_TIMEOUT_SECONDS = 3
ADAPTER_POLL_SECONDS = 0.1
MIN_CANVAS_VIEWPORT_SHARE = ${MIN_CANVAS_VIEWPORT_SHARE}
CANVAS_VIEWPORT_SHARE_JS = ${JSON.stringify(CANVAS_VIEWPORT_SHARE_JS)}

GAME_PORT = os.environ.get("VERIFY_GAME_PORT", "3000")
GAME_URL = "http://127.0.0.1:" + GAME_PORT + "/index.html"
LAST_JSON_PATH = os.environ["VERIFY_LAST_JSON_PATH"]
SCREENSHOT_PATH = os.environ["VERIFY_SCREENSHOT_PATH"]
TEMPLATE_VERIFICATION = json.loads(os.environ.get("VERIFY_TEMPLATE_VERIFICATION_JSON", "null"))
TEMPLATE_ASSET_POLICY = json.loads(os.environ.get("VERIFY_TEMPLATE_ASSET_POLICY_JSON", "null"))
HAS_TEMPLATE_POLICY = TEMPLATE_VERIFICATION or TEMPLATE_ASSET_POLICY

CHROMIUM_ARGS = ${CHROMIUM_ARGS}


def cap(message):
    return str(message)[:MAX_ERROR_CHARS]


def is_local(url):
    return url.startswith("http://127.0.0.1:" + GAME_PORT + "/")


def local_gltf_path(url):
    if not is_local(url):
        return None
    path = urlparse(url).path.lstrip("/")
    return path if path.endswith(".gltf") else None


def initial_asset_policy_failures(requested_paths):
    if not TEMPLATE_ASSET_POLICY:
        return []

    requested = sorted(set(requested_paths))
    declared = sorted(set(path.lstrip("/") for path in TEMPLATE_ASSET_POLICY["eagerModelPaths"]))
    failures = []
    if len(requested) > 6:
        failures.append("initial page requested " + str(len(requested)) + " glTF models; at most 6 eager models are allowed")
    if requested != declared:
        failures.append(
            "initial glTF paths differ from the accepted receipt (requested: "
            + (", ".join(requested) or "none")
            + "; declared: " + (", ".join(declared) or "none") + ")"
        )
    return failures


async def adapter_value(page, path):
    # The manifest schema permits only dotted identifier paths, so this fixed
    # expression cannot execute repository, model, or player supplied code.
    return await page.evaluate(
        "(path) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], window.__NUMA_VERIFY__)",
        path,
    )


async def assert_adapter_equals(page, scenario_name, assertion, failures):
    deadline = asyncio.get_running_loop().time() + ADAPTER_ASSERTION_TIMEOUT_SECONDS
    actual = await adapter_value(page, assertion["path"])
    while actual != assertion["equals"] and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(ADAPTER_POLL_SECONDS)
        actual = await adapter_value(page, assertion["path"])
    if actual != assertion["equals"]:
        failures.append(
            scenario_name + ": __NUMA_VERIFY__." + assertion["path"]
            + " expected " + json.dumps(assertion["equals"])
            + " but got " + json.dumps(actual)
        )


async def run_template_contract(page, failures):
    if not TEMPLATE_VERIFICATION:
        return

    try:
        for selector in TEMPLATE_VERIFICATION["requiredSelectors"]:
            await page.wait_for_selector(selector, state="attached", timeout=6000)
    except Exception as error:
        failures.append("required selector missing: " + cap(error))
        return

    for scenario in TEMPLATE_VERIFICATION["scenarios"]:
        try:
            for action in scenario["actions"]:
                if action["type"] == "click":
                    # Scenarios assert the public adapter after each click; waiting for
                    # incidental page navigations can time out after the click
                    # already changed game state (especially under WebGL load).
                    await page.locator(action["selector"]).first.click(timeout=6000, no_wait_after=True)
                elif action["type"] == "waitFor":
                    await page.wait_for_selector(action["selector"], state="attached", timeout=6000)
            for assertion in scenario["assertions"]:
                await assert_adapter_equals(page, scenario["name"], assertion, failures)
        except Exception as error:
            failures.append(scenario["name"] + ": " + cap(error))


async def main():
    baseline = set(json.loads(os.environ.get("VERIFY_BASELINE_JSON", "[]")))
    current = []
    template_failures = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        page = await browser.new_page()
        initial_gltf_paths = set()
        initial_gltf_pending = set()
        initial_gltf_failed = set()
        initial_phase = True

        def on_console(message):
            if message.type == "error":
                current.append(cap(message.text))

        def on_page_error(error):
            current.append(cap(error))

        def on_request(request):
            path = local_gltf_path(request.url)
            if initial_phase and path:
                initial_gltf_pending.add(request)

        def on_request_finished(request):
            initial_gltf_pending.discard(request)

        def on_response(response):
            if HAS_TEMPLATE_POLICY and is_local(response.url) and response.status >= 400:
                template_failures.append("local asset HTTP " + str(response.status) + ": " + response.url)
            gltf_path = local_gltf_path(response.url)
            if initial_phase and gltf_path:
                if 200 <= response.status < 300:
                    initial_gltf_paths.add(gltf_path)
                else:
                    initial_gltf_failed.add(gltf_path)

        def on_request_failed(request):
            initial_gltf_pending.discard(request)
            gltf_path = local_gltf_path(request.url)
            if initial_phase and gltf_path:
                initial_gltf_failed.add(gltf_path)
            if HAS_TEMPLATE_POLICY and is_local(request.url):
                failure = request.failure or "request failed"
                template_failures.append("local asset request failed: " + request.url + " (" + str(failure) + ")")

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("request", on_request)
        page.on("requestfinished", on_request_finished)
        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)

        # Template readiness below, not the browser load event, is the
        # authoritative signal. A busy WebGL page can miss Playwright's
        # default 30s load deadline even when it becomes playable shortly after.
        await page.goto(GAME_URL, wait_until="commit" if TEMPLATE_ASSET_POLICY else "load")
        if TEMPLATE_ASSET_POLICY:
            # Network quiet alone cannot establish that application JS will not
            # schedule another eager fetch. The game must explicitly signal that
            # its initial loading phase is complete before scenarios can begin.
            try:
                await page.wait_for_function("window.__NUMA_VERIFY_READY__ === true", timeout=INITIAL_READY_TIMEOUT_SECONDS * 1000)
                await page.wait_for_load_state("networkidle", timeout=INITIAL_READY_TIMEOUT_SECONDS * 1000)
                deadline = asyncio.get_running_loop().time() + INITIAL_READY_TIMEOUT_SECONDS
                while initial_gltf_pending and asyncio.get_running_loop().time() < deadline:
                    await asyncio.sleep(ADAPTER_POLL_SECONDS)
                if initial_gltf_pending:
                    template_failures.append("initial glTF requests did not settle before timeout")
            except Exception:
                template_failures.append("initial asset readiness could not be established before timeout")
            if initial_gltf_failed:
                template_failures.append("initial glTF requests failed: " + ", ".join(sorted(initial_gltf_failed)))
            if not initial_gltf_pending and not any("readiness" in failure for failure in template_failures):
                template_failures.extend(initial_asset_policy_failures(initial_gltf_paths))
        else:
            await asyncio.sleep(RENDER_WAIT_SECONDS)
        initial_phase = False
        await run_template_contract(page, template_failures)
        if HAS_TEMPLATE_POLICY:
            canvas_share = await page.evaluate(CANVAS_VIEWPORT_SHARE_JS)
            if canvas_share is not None and canvas_share < MIN_CANVAS_VIEWPORT_SHARE:
                template_failures.append(
                    "game canvas covers only " + str(round(canvas_share * 100)) + "% of the viewport; "
                    + "the page layout likely pushes it off-screen (check createGame's mount and #app's CSS)"
                )

        # Release the desktop WebGL renderer before loading a second scene.
        # Software Chromium can stall when both pages render concurrently.
        os.makedirs(os.path.dirname(SCREENSHOT_PATH), exist_ok=True)
        await page.screenshot(path=SCREENSHOT_PATH, type="jpeg", quality=80)
        await page.close()

        if TEMPLATE_VERIFICATION:
            viewport = TEMPLATE_VERIFICATION["touchViewport"]
            touch_page = await browser.new_page(
                viewport={"width": viewport["width"], "height": viewport["height"]},
                has_touch=True,
            )
            def on_touch_console(message):
                if message.type == "error":
                    template_failures.append("touch page console error: " + cap(message.text))

            def on_touch_page_error(error):
                template_failures.append("touch page error: " + cap(error))

            touch_page.on("console", on_touch_console)
            touch_page.on("pageerror", on_touch_page_error)
            touch_page.on("response", on_response)
            touch_page.on("requestfailed", on_request_failed)
            await touch_page.goto(GAME_URL, wait_until="commit" if TEMPLATE_ASSET_POLICY else "load")
            if TEMPLATE_ASSET_POLICY:
                try:
                    await touch_page.wait_for_function("window.__NUMA_VERIFY_READY__ === true", timeout=INITIAL_READY_TIMEOUT_SECONDS * 1000)
                    await touch_page.wait_for_load_state("networkidle", timeout=INITIAL_READY_TIMEOUT_SECONDS * 1000)
                except Exception:
                    template_failures.append("touch asset readiness could not be established before timeout")
            await run_template_contract(touch_page, template_failures)
            await touch_page.close()

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
        "templateFailures": template_failures[:MAX_ERRORS],
    }))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
`
