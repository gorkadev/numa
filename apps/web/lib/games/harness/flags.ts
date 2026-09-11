/**
 * Gates the phased flow (understand → plan → workers → verify) behind an
 * env var — on by default since unit 8, now that size routing (`plan` vs.
 * direct edits) lives in `instructions/workflow.ts`'s own prompt (design.md
 * decision 8, "Rollout": "the single-loop path stays the default ... until
 * unit 8 flips this default to on").
 *
 * Set `HARNESS_PHASES=false` to fall back to the single-loop path — the
 * exact rollback boundary tasks.md's unit 8 row names ("Set HARNESS_PHASES
 * back to off"). Every dispatch tool stays declared on `chat.agent({ tools })`
 * either way (decision 6); only `activeTools` in `trigger/chat.ts` changes
 * with this flag.
 */
export const HARNESS_PHASES = process.env.HARNESS_PHASES !== "false"
