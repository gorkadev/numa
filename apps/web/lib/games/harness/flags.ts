/**
 * Gates the phased flow (understand → plan → workers → verify) behind an
 * env var — on by default since unit 8, now that size routing (`plan` vs.
 * direct edits) lives in `instructions/workflow.ts`'s own prompt (design.md
 * decision 8, "Rollout": "the single-loop path stays the default ... until
 * unit 8 flips this default to on").
 *
 * Set `HARNESS_PHASES=false` to fall back to the single-loop path — the
 * exact rollback boundary tasks.md's unit 8 row names ("Set HARNESS_PHASES
 * back to off"). This is the single source of truth both halves of that
 * fallback read: `trigger/chat.ts`'s `activeTools` narrows every phase tool
 * (`explore`, `plan`, `run_tasks`, `verify`, `load_skill`) out of a turn's
 * callable set, and `instructions/index.ts` builds the orchestrator's own
 * prompt byte-identical to what it was before this unit — every skill
 * pushed, no routing section, no skill index — reading this same flag
 * rather than assuming `activeTools` alone is enough. Every dispatch tool
 * stays declared on `chat.agent({ tools })` either way (decision 6); only
 * which tools are active, and what the prompt tells the model to do with
 * them, changes with this flag.
 */
export const HARNESS_PHASES = process.env.HARNESS_PHASES !== "false"
