/**
 * Gates the phased flow (understand → design → tasks → workers → verify)
 * behind an env var. Off by default: unit 2a's runner and role catalogue
 * exist, but no dispatch tool is declared on the orchestrator's tool set yet
 * (that starts in unit 2b, still behind this same flag), so the single-loop
 * path stays the only one a real turn can take until unit 8 flips this
 * default to on (design.md decision 8, "Rollout").
 */
export const HARNESS_PHASES = process.env.HARNESS_PHASES === "true"
