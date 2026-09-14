import { DaytonaFileNotFoundError } from "@daytona/sdk"

import {
  MAX_ERROR_CHARS,
  VERIFY_SCRIPT_PATH,
  VERIFY_SCRIPT_PY,
} from "./verify-script"
import {
  CHROMIUM_LABEL,
  GAME_DIR,
  GAME_PORT,
  getGameSandbox,
  startGameServer,
} from "./utils"

/**
 * The one console-error finding shape both this module and the verifier
 * sub-agent's envelope share (`harness/envelope.ts`'s `Finding`, unit 2a).
 * Duplicated as a local `Severity` alias rather than importing `Finding`
 * itself: `lib/daytona` is infrastructure and stays free of any `lib/games`
 * import, the same layering `lib/ai` already holds against `lib/games`
 * (`pricing.ts`'s own note on `AgentUsageEntry`) — `harness/tools/verify.ts`
 * is the one file that already imports both `lib/daytona/verify.ts` and
 * `harness/envelope.ts`, so it is the seam that turns this into a real
 * `Finding[]`, not this module.
 */
export type VerifyFinding = { message: string; severity: "error" | "warning" }

export type VerifyStatus = "pass" | "fail" | "unavailable"

export type VerifyCheckResult = {
  status: VerifyStatus
  findings: VerifyFinding[]
  /** A JPEG screenshot of the running game, present only when the check actually launched Chromium. */
  screenshot?: Buffer
}

/** Where the sandbox keeps its own state for this check, relative to `GAME_DIR`. */
const VERIFY_DIR = ".numa/verify"
const LAST_JSON_RELATIVE = `${VERIFY_DIR}/last.json`
const SCREENSHOT_RELATIVE = `${VERIFY_DIR}/screenshot.jpg`

/**
 * The check's own execution budget — the "60 s check" half of task 6.3's
 * "90 s + 60 s check budget" (the 90 s half is `ROLES.verifier.timeoutMs`,
 * `harness/roles.ts`). The unit 5 spike measured a 7.6–8.5 s band on the
 * real game template, so this leaves wide margin for a slower game or a
 * loaded sandbox rather than being tuned to the spike's own numbers.
 */
const CHECK_TIMEOUT_SECONDS = 60

function parseErrorList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

/**
 * Reads the console-error baseline this game's sandbox currently holds —
 * whatever the last check to run against it (this turn or an earlier one)
 * left in `.numa/verify/last.json` — or an empty baseline for a game that
 * has never been checked (design.md: "With no baseline, every error counts
 * as caused.").
 *
 * Called at most once per turn by `harness/tools/verify.ts`, which caches
 * the result in `turnState.verifyBaseline` for the rest of the turn: reading
 * it again after this turn's own first check would read back that SAME
 * check's freshly written result, not what the turn actually started from.
 */
export async function readVerifyBaseline(gameId: string): Promise<string[]> {
  const { sandbox } = await getGameSandbox(gameId)

  try {
    const raw = await sandbox.fs.downloadFile(`${GAME_DIR}/${LAST_JSON_RELATIVE}`)
    return parseErrorList(JSON.parse(raw.toString("utf8")) as unknown)
  } catch (error) {
    if (error instanceof DaytonaFileNotFoundError) return []
    throw error
  }
}

/**
 * Runs the fixed verify script against this game's current sandbox state and
 * reports the code-decided result — design.md decision 13: "Code decides the
 * console verdict."
 *
 * `baseline` is supplied by the caller rather than read from the sandbox
 * here, on purpose: see `readVerifyBaseline`'s own note on why a corrective
 * retry must not re-read the file this same check just wrote.
 */
export async function runGameCheck(
  gameId: string,
  baseline: string[]
): Promise<VerifyCheckResult> {
  const { sandbox } = await getGameSandbox(gameId)

  /**
   * `sandbox.labels` is typed as always present, but read defensively —
   * matching `CHROMIUM_LABEL`'s own doc comment in `utils.ts` — since a
   * sandbox created before this label existed is exactly the case this
   * branch exists for (design.md Deviation 2: "older games report
   * unavailable").
   */
  if (sandbox.labels?.[CHROMIUM_LABEL] !== "true") {
    return {
      status: "unavailable",
      findings: [
        {
          message:
            "This game's sandbox was created before headless-browser verification shipped and has no Chromium installed. Verification did not run.",
          severity: "error",
        },
      ],
    }
  }

  const { sandbox: running } = await startGameServer(sandbox.id)

  await running.process.executeCommand(`mkdir -p ${GAME_DIR}/${VERIFY_DIR}`)
  await running.fs.uploadFile(Buffer.from(VERIFY_SCRIPT_PY, "utf8"), VERIFY_SCRIPT_PATH)

  const response = await running.process.executeCommand(
    `python3 ${VERIFY_SCRIPT_PATH}`,
    undefined,
    {
      VERIFY_GAME_PORT: String(GAME_PORT),
      VERIFY_BASELINE_JSON: JSON.stringify(baseline),
      VERIFY_LAST_JSON_PATH: `${GAME_DIR}/${LAST_JSON_RELATIVE}`,
      VERIFY_SCREENSHOT_PATH: `${GAME_DIR}/${SCREENSHOT_RELATIVE}`,
    },
    CHECK_TIMEOUT_SECONDS
  )

  if (response.exitCode !== 0) {
    return {
      status: "unavailable",
      findings: [
        {
          message: `The headless-browser check failed to run: ${response.result.slice(0, MAX_ERROR_CHARS)}`,
          severity: "error",
        },
      ],
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(response.result)
  } catch {
    return {
      status: "unavailable",
      findings: [
        {
          message: "The headless-browser check produced output that could not be parsed.",
          severity: "error",
        },
      ],
    }
  }

  const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
  const newErrors = parseErrorList(record.newErrors)
  const preExisting = parseErrorList(record.preExisting)

  const findings: VerifyFinding[] = [
    ...newErrors.map((message) => ({ message, severity: "error" as const })),
    ...preExisting.map((message) => ({
      message: `${message} (pre-existing, not caused by this turn)`,
      severity: "warning" as const,
    })),
  ]

  let screenshot: Buffer | undefined

  try {
    screenshot = await running.fs.downloadFile(`${GAME_DIR}/${SCREENSHOT_RELATIVE}`)
  } catch {
    screenshot = undefined
  }

  return {
    status: newErrors.length > 0 ? "fail" : "pass",
    findings,
    screenshot,
  }
}
