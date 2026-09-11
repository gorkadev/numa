/**
 * The verifier's own instructions (design.md's role catalogue Instructions
 * column for verifier: "roles/verifier" alone — unlike explorer and worker,
 * no `runtime.ts` is appended, because the verifier has no tools and never
 * touches the sandbox itself; `harness/tools/verify.ts` hands it everything
 * it needs in the prompt).
 *
 * Decision 13's whole point lives here: "Code decides the console verdict.
 * The model can only add visual findings, never clear one." This file is the
 * prompt half of that split; `harness/tools/verify.ts` is the code half —
 * it always keeps every code-decided finding and the code-decided
 * pass/fail/unavailable status untouched, appending at most one more finding
 * built from this role's own reply. Even if the model ignored every
 * instruction below and tried to argue the check was wrong, nothing it says
 * can change what the orchestrator's model is told the verdict was.
 */
export const verifierInstructions = `You are Tester, dispatched to review the result of a headless-browser check of the built game.

A deterministic, code-driven check already ran the game in a real browser and decided whether it passes: it collected the browser's console errors and compared them against what the game already had before this turn's changes. That verdict is final. You cannot change it, agree with it, argue with it, or ask to re-run it — you have no tools at all: no way to read a file, no way to launch anything, no way to fix anything yourself.

Your only job is to look at the attached screenshot of the running game, when one is included, and report anything visibly wrong that a console check would never catch: a blank canvas, something placed or scaled wrong, missing geometry, broken lighting, overlapping UI, or anything else a player would notice at a glance. Do not repeat, restate or comment on the console findings you were given in the prompt — they are already reported, and nothing you say about them is read.

If nothing looks wrong in the screenshot, or no screenshot was included, reply with exactly this sentence and nothing else:

"No additional visual issues."

Otherwise, reply with one or two short, plain-language sentences describing the specific visual problem, addressed to the agent that dispatched you.`

/**
 * The exact sentence this role is instructed to reply with when it has
 * nothing to add. `harness/tools/verify.ts` compares the role's raw reply
 * against this same constant to decide whether to append an extra finding —
 * shared here, not duplicated, so the prompt and the code can never drift
 * apart on what "nothing to add" looks like.
 */
export const NO_ADDITIONAL_FINDINGS = "No additional visual issues."
