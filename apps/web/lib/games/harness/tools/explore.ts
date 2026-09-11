import { tool, type Tool, type ToolSet } from "ai"
import { z } from "zod"

import { runtimeInstructions } from "@/lib/games/instructions/runtime"
import { explorerInstructions } from "@/lib/games/instructions/roles/explorer"
import { createGameTools } from "@/lib/games/tools"

import type { SubagentEnvelope } from "../envelope"
import { runSubagent, type RunSubagentResult, type SubagentProgress } from "../run-subagent"
import { ROLES } from "../roles"

/**
 * Ceiling on the envelope text the orchestrator's model actually sees
 * (design.md decision 4: "toModelOutput renders the envelope as text
 * (≤ 1.5k chars)"). The player-visible run — every tool call, the full
 * summary — stays in the stored tool-output part; only this truncated form
 * ever reaches a token budget.
 */
const MAX_ENVELOPE_CHARS = 1500

const TRUNCATION_MARK = "…"

/**
 * Serializes an envelope within `MAX_ENVELOPE_CHARS` without ever cutting the
 * JSON itself: only `summary`, the one free-text field that can grow, is
 * shortened, so the model always receives a complete, parseable object with
 * `agent` and `status` intact.
 */
function renderEnvelope(envelope: SubagentEnvelope): string {
  const full = JSON.stringify(envelope)
  if (full.length <= MAX_ENVELOPE_CHARS) return full

  const overflow = full.length - MAX_ENVELOPE_CHARS + TRUNCATION_MARK.length
  const summary =
    envelope.summary.slice(0, Math.max(0, envelope.summary.length - overflow)) +
    TRUNCATION_MARK

  return JSON.stringify({ ...envelope, summary })
}

/** The only tools an explorer run may call — see `explorerTools` below. */
const EXPLORER_TOOL_NAMES: readonly string[] = ["read_file", "list_files"]

/**
 * The explorer's own tool set: read-only, a subset of `createGameTools`'s
 * full set rather than a new implementation, so a path resolves and fails
 * exactly the way it does for the orchestrator's own `read_file`/`list_files`
 * calls. No write tool and no `ask_player` are included — the explorer role
 * has neither (`agent-orchestration`'s Workers Never Delegate and `ask_player`
 * Stays With the Orchestrator requirements apply to every worker, this one
 * included).
 *
 * Filtered by entries rather than destructured by name: `ToolSet` is a
 * `Record<string, Tool>`, so a named property read (`tools.read_file`) types
 * as possibly `undefined` under `noUncheckedIndexedAccess` — correct in
 * general, since nothing statically guarantees a string-keyed record has a
 * given key, but this codebase already knows `createGameTools` always
 * includes both. Filtering keeps that knowledge in the constant above
 * instead of asserting it away at each use.
 */
function explorerTools(gameId: string): ToolSet {
  const tools = createGameTools(gameId)

  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => EXPLORER_TOOL_NAMES.includes(name))
  )
}

/**
 * Builds the `explore` dispatch tool for one game.
 *
 * A factory, not a module-level constant, for the same reason
 * `createGameTools` is one: the tool closes over a `gameId` that only exists
 * once a chat does, and `trigger/chat.ts`'s `tools` factory calls this once
 * per turn's tool-set resolution, matching how `createGameTools` itself is
 * called.
 */
/**
 * Explicit return type, not inferred: TypeScript cannot name the inferred
 * type of `tool(...)` without a reference to `@ai-sdk/provider-utils`, which
 * is not this app's direct dependency (`ai` re-exports the runtime value but
 * `declaration: true` still requires a nameable type for this exported
 * function's signature). `Tool`'s own defaults (`any` for every type
 * parameter) are enough here — the specific input/output types are already
 * fully checked inside the `tool({...})` call below.
 */
export function createExploreTool(gameId: string): Tool {
  const tools = explorerTools(gameId)

  return tool({
    description: [
      "Dispatch a read-only sub-agent to investigate the game's current files and answer a specific question about them.",
      "Use it before a change whose shape depends on code you have not read this turn, when the answer needs looking across more than one file — a single read_file or list_files call would do for anything narrower.",
      "It cannot write, edit or delete anything, and it does not report back the files it read — only a short answer to the question you gave it.",
    ].join(" "),
    inputSchema: z.object({
      question: z
        .string()
        .min(1)
        .describe(
          "A specific question about the game's current files, e.g. \"what controls does the player currently have?\" or \"is there already a scoring system, and where does it live?\". Not a task to perform — the explorer only reads and reports."
        ),
    }),
    /**
     * An async generator, not a plain async function: `runSubagent` is itself
     * one, yielding a throttled `SubagentProgress` snapshot as the run
     * progresses (design.md decision 5's "compact preliminary record").
     *
     * The AI SDK's own tool executor (`@ai-sdk/provider-utils`'s
     * `executeTool`) drives this with a plain `for await...of` loop and takes
     * the LAST YIELDED value as the tool's final result — a generator's
     * `return` value is never observed, only what it `yield`s. So every
     * `SubagentProgress` snapshot is re-yielded here as a preliminary result,
     * and the run's own return value — `{ envelope, records }` — is yielded
     * one final time after the loop, making it the last (and only
     * non-preliminary) value the SDK sees.
     */
    execute: async function* (
      { question },
      { abortSignal }
    ): AsyncGenerator<SubagentProgress | RunSubagentResult, void, void> {
      const run = runSubagent({
        role: ROLES.explorer,
        instructions: `${explorerInstructions}\n\n${runtimeInstructions.content}`,
        tools,
        prompt: question,
        abortSignal,
      })

      let next = await run.next()

      while (!next.done) {
        yield next.value
        next = await run.next()
      }

      yield next.value
    },
    /**
     * The orchestrator's model sees only the envelope — status and summary,
     * never the full `records` transcript of tool calls the player-facing UI
     * renders from the same stored output (`agent-orchestration`'s Compact
     * Result Envelope requirement). Serialized as JSON text rather than the
     * `content`/multi-modal shape: the envelope carries no image or file
     * parts to preserve, so a plain string is the simplest thing that reads
     * as a result rather than as an opaque object.
     *
     * `output` is typed as the union of every value `execute` yields, but the
     * SDK only ever calls `toModelOutput` on the final, non-preliminary one —
     * confirmed against the installed `ai@7.0.93`'s conversion path, which
     * filters preliminary tool-result parts out before this hook runs — so
     * the `"envelope" in output` guard below never actually sees a bare
     * `SubagentProgress`. It exists to satisfy the type checker, which cannot
     * see that runtime guarantee.
     */
    toModelOutput: ({ output }) => ({
      type: "text",
      value:
        "envelope" in output
          ? renderEnvelope(output.envelope)
          : "The explorer is still investigating.",
    }),
  })
}
