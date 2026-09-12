import { tool, type ModelMessage, type Tool, type UserContent } from "ai"
import { z } from "zod"

import { readVerifyBaseline, runGameCheck, type VerifyFinding } from "@/lib/daytona/verify"
import {
  NO_ADDITIONAL_FINDINGS,
  verifierInstructions,
} from "@/lib/games/instructions/roles/verifier"

import { renderEnvelope, type Finding, type SubagentEnvelope } from "../envelope"
import { ROLES } from "../roles"
import { runSubagent, type RunSubagentResult, type SubagentProgress } from "../run-subagent"
import { turnState } from "../turn-state"

/**
 * "2 calls/turn cap" (task 6.3) — design.md: "Verify budget: 2 calls per
 * turn, which allows one fix round with run_tasks fix tasks." The first call
 * is the initial check; the second is the one corrective retry the spec's
 * "One Corrective Retry on Turn-Caused Failure" requirement allows. A third
 * call this same turn is refused outright, never run.
 */
const MAX_VERIFY_CALLS_PER_TURN = 2

/**
 * What this tool actually reports back, one layer richer than
 * `lib/daytona/verify.ts`'s own `pass | fail | unavailable`: `refused` is
 * this tool's own outcome for a call that never ran at all, because the
 * turn's budget was already spent.
 */
export type VerifyOutcome = "pass" | "fail" | "unavailable" | "refused"

/** `record` is `undefined` for a call that never actually ran the verifier sub-agent: `refused` (budget spent) or `unavailable` (no sandbox check to hand it a screenshot). Not part of what the model sees — `toModelOutput` below only ever reads `envelope`. */
export type RunVerifyResult = {
  outcome: VerifyOutcome
  envelope: SubagentEnvelope
  record?: SubagentProgress
}

/** `VerifyFinding` (`lib/daytona/verify.ts`, no `taskId`) widened into the harness's own `Finding` shape. */
function toFindings(findings: VerifyFinding[]): Finding[] {
  return findings.map(({ message, severity }) => ({ message, severity }))
}

function findingsSummary(findings: Finding[]): string {
  if (findings.length === 0) return "No console errors."
  return findings.map((finding) => `[${finding.severity}] ${finding.message}`).join("\n")
}

/**
 * The console-error baseline this turn started from, read once and cached in
 * `turnState.verifyBaseline` — see that field's own comment for why a second
 * call this turn must reuse the cached value rather than reading the
 * sandbox's `last.json` again (`lib/daytona/verify.ts`'s check just
 * overwrote it with THIS call's own result).
 */
async function baselineForThisTurn(gameId: string): Promise<string[]> {
  if (turnState.verifyBaseline === undefined) {
    turnState.verifyBaseline = await readVerifyBaseline(gameId)
  }

  return turnState.verifyBaseline
}

function refusedResult(): RunVerifyResult {
  return {
    outcome: "refused",
    envelope: {
      agent: "verifier",
      status: "blocked",
      summary:
        "Verify has already run twice this turn — one check plus one corrective retry, the budget design.md sets for a turn. No further verify calls are allowed this turn; report the current, actual state honestly rather than checking again.",
    },
  }
}

/**
 * The verifier's own prompt: the code-decided findings as text, plus the
 * screenshot as an image part when the check actually captured one. A plain
 * string when there is no screenshot (an `unavailable` check never reaches
 * this function at all — see `createVerifyTool` below), so the common case
 * still exercises `RunSubagentInput.prompt`'s `string` arm.
 */
function buildVerifierPrompt(findings: Finding[], screenshot: Buffer | undefined): ModelMessage[] {
  const text = `The code-decided console check found:\n${findingsSummary(findings)}\n\nLook at the attached screenshot of the running game, if one is included, and report only NEW visual problems you can see — do not repeat or comment on the console findings above.`

  const content: UserContent = screenshot
    ? [
        { type: "text", text },
        { type: "file", data: screenshot, mediaType: "image/jpeg" },
      ]
    : text

  return [{ role: "user", content }]
}

/**
 * Builds the `verify` dispatch tool for one game.
 *
 * Two layers, matching design.md decision 13: `runGameCheck`
 * (`lib/daytona/verify.ts`) runs the deterministic headless-browser check and
 * decides `pass`/`fail`/`unavailable` in code; this tool then dispatches the
 * verifier sub-agent (role `verifier`, `strong` slot, no tools) to look at
 * the screenshot and add — never remove or override — a visual finding. The
 * code-decided outcome and every code-decided finding survive into the final
 * envelope untouched, whatever the verifier's own reply says.
 */
export function createVerifyTool(gameId: string): Tool {
  return tool({
    description: [
      "Run the deterministic, headless-browser check of the game exactly as it exists right now, then have a reviewer look at a screenshot for anything the console check cannot see.",
      "The pass/fail result is decided by code from real browser console errors and cannot be argued with or talked out of — call this only after run_tasks has actually applied every change you want checked, never before.",
      "At most 2 calls per turn: an initial check, and if it fails, exactly one more call after dispatching a corrective run_tasks pass. A third call this turn is refused outright.",
    ].join(" "),
    inputSchema: z.object({}),
    /**
     * Manually drives `runSubagent`'s generator the same way `explore.ts`
     * and `run-tasks.ts` do (their own documented Deviation 1/1): its
     * `return` value is invisible to the SDK's own `for await...of` tool
     * executor, so the final result is yielded explicitly as this
     * generator's own last value.
     */
    execute: async function* (
      _input,
      { abortSignal }
    ): AsyncGenerator<SubagentProgress | RunVerifyResult, void, void> {
      if (turnState.verifyCalls >= MAX_VERIFY_CALLS_PER_TURN) {
        yield refusedResult()
        return
      }

      turnState.verifyCalls += 1

      const baseline = await baselineForThisTurn(gameId)
      const check = await runGameCheck(gameId, baseline)

      if (check.status === "unavailable") {
        const findings = toFindings(check.findings)

        yield {
          outcome: "unavailable",
          envelope: {
            agent: "verifier",
            status: "unavailable",
            summary: `Verify result: UNAVAILABLE. ${findingsSummary(findings)}`,
            findings,
          },
        }
        return
      }

      const codeFindings = toFindings(check.findings)

      const run = runSubagent({
        role: ROLES.verifier,
        instructions: verifierInstructions,
        tools: {},
        prompt: buildVerifierPrompt(codeFindings, check.screenshot),
        abortSignal,
      })

      let next = await run.next()

      while (!next.done) {
        yield next.value
        next = await run.next()
      }

      const result: RunSubagentResult = next.value
      const verifierReply = result.envelope.summary.trim()

      /**
       * The model may only ADD a finding, never clear one (task 6.4): every
       * code-decided finding stays, whatever the verifier said, and its own
       * reply becomes one more finding only when it differs from the exact
       * "nothing to add" sentence both this file and `roles/verifier.ts`
       * share. The code-decided `check.status` — never the verifier's own
       * run status — is what `outcome` reports.
       */
      const findings: Finding[] =
        verifierReply.length > 0 && verifierReply !== NO_ADDITIONAL_FINDINGS
          ? [...codeFindings, { message: verifierReply, severity: "warning" }]
          : codeFindings

      yield {
        outcome: check.status,
        envelope: {
          ...result.envelope,
          summary: `Verify result: ${check.status.toUpperCase()}. ${findingsSummary(codeFindings)}${
            verifierReply.length > 0 ? `\nReviewer: ${verifierReply}` : ""
          }`,
          findings,
        },
        record: result.record,
      }
    },
    /**
     * The orchestrator's model sees the envelope only — the code-decided
     * verdict is the first words of `summary` ("Verify result: PASS/FAIL/
     * UNAVAILABLE."), so it reaches the model unambiguously through the same
     * truncation-safe renderer every other dispatch tool uses
     * (`agent-orchestration`'s Compact Result Envelope requirement).
     */
    toModelOutput: ({ output }) => ({
      type: "text",
      value: "envelope" in output ? renderEnvelope(output.envelope) : "Verify is still running.",
    }),
  })
}
