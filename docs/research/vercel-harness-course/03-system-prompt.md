# Module 3 — The System Prompt
Source lessons:
- "Structuring Agent Instructions" — https://vercel.com/academy/build-ai-agent-harness/structuring-agent-instructions
- "Dynamic Prompt Construction" — https://vercel.com/academy/build-ai-agent-harness/dynamic-prompt-construction
- "Verification Gates" — https://vercel.com/academy/build-ai-agent-harness/verification-gates
- "Project Context" — https://vercel.com/academy/build-ai-agent-harness/project-context

## Structuring Agent Instructions
**Core idea:** Tool descriptions already steer *which* tool gets picked, but the system prompt is where the harness's *policy* lives — not what the agent can do, but what it should do, in what order, with what restraint. A one-line prompt ("You are a coding agent.") can't carry policy; a sectioned prompt can.

**Key points:**
- Explicit sections introduced: `# Agency` (permission + instruction to act: use tools, don't just describe a plan, prefer the specialized tool over `bash`) and `# Guardrails` (constraints: minimal changes, search-and-reuse before creating, no new dependencies without asking).
- The "actually do it" instruction is called load-bearing and "annoyingly necessary": without an explicit anti-explaining instruction, agents drift toward narrating a plan instead of executing it, even with strong tool descriptions already in place.
- Tool preferences are stated **both** in tool descriptions (Module 2) and again in the system prompt's Agency section — deliberate repetition, because models miss steering stated in only one place.
- "No new dependencies without asking" is explicitly seeded here as groundwork for the human-in-the-loop work built later in the course (Module 8, not part of these notes).
- Full section anatomy table given (role line → Agency → Guardrails → Tool Usage → Communication), with a stated growth rule: **start with Agency and Guardrails; add Tool Usage/Communication only once the prompt grows past ~20 lines.**
- Practical debugging exercise recommended: delete the Agency section and re-run the same task to see if the agent reverts to explainer mode; delete Guardrails and see if it starts adding dependencies unprompted. This isolates which section is doing which job.

**Code patterns:**
```ts
instructions: `You are a coding agent working in: ${cwd}

# Agency
- USE your tools. Read files, search code, run commands, then answer.
- Do NOT explain what you WOULD do. Actually do it.
- Prefer grep for searching, read for viewing files.
- Use bash only for commands that aren't covered by other tools.

# Guardrails
- Prefer simple, minimal changes
- Search before creating, and reuse existing patterns
- No new dependencies without asking`,
```

**Applies to numa:**
- numa's system prompt is already split into workflow/runtime/engine blocks — this lesson's Agency/Guardrails sections map onto the "workflow" block; worth confirming numa's workflow block has an explicit "act, don't narrate" instruction, since Gemini models (like the tested Haiku/Sonnet/Opus trio) can also drift into explaining plans instead of calling tools.
- "State tool preferences in both the tool description and the prompt" is directly actionable: numa's engine block (~250 lines, always loaded) is a natural place to restate which tool to prefer for which numa-specific task (e.g. "prefer replace_text for surgical edits, write_file only for new files or full rewrites").
- Guardrails' "no new dependencies without asking" generalizes to numa's actual risk surface — e.g. "don't add new npm packages to the game's package.json without flagging it," which matters more in numa's sandboxed game-build context than local dev dependency additions.

## Dynamic Prompt Construction
**Core idea:** A hardcoded prompt string breaks the moment any input to it varies — working directory, sandbox backend, or a subagent with a reduced toolset. Extracting a pure `buildSystemPrompt(ctx: PromptContext)` function makes the prompt testable, composable, and swappable without string surgery.

**Key points:**
- `PromptContext` interface: `workingDirectory`, `sandboxType`, `toolNames: string[]` (always required) plus optional `gitBranch?` and `projectContext?` (not always knowable, so sections are conditionally included).
- Builder pattern is intentionally low-tech: push strings into a `sections: string[]` array, `if (ctx.foo) sections.push(...)` for optional blocks, `sections.join("\n")` at the end. Explicitly **no template engine, no DSL** — "the prompt is a string; building it should look like building a string."
- `toolNames` is what lets the same builder serve a subagent with a reduced tool subset — the prompt only lists tools that are actually wired up for that particular agent instance.
- Four stated benefits of making the prompt a pure function: **testable** (assert output for a given context), **composable** (add sections without touching others), **replaceable** (users/callers can supply their own builder), **deterministic** (same context → same prompt, always, no side effects).
- Suggested minimal test: build with `gitBranch: "main"` and assert the output contains "Current branch: main"; build without it and assert the line is absent — cheapest possible regression test for prompt-section bugs that are otherwise invisible by reading model output.

**Code patterns:**
```ts
export interface PromptContext {
  workingDirectory: string;
  sandboxType: string;
  toolNames: string[];
  gitBranch?: string;
  projectContext?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [];
  sections.push(`You are a coding agent working in: ${ctx.workingDirectory}`);
  sections.push(`Sandbox: ${ctx.sandboxType}`);
  sections.push(`
# Agency
- USE your tools. Read files, search code, run commands, then answer.
- Do NOT explain what you WOULD do. Actually do it.
- Available tools: ${ctx.toolNames.join(", ")}`);
  if (ctx.gitBranch) sections.push(`- Current branch: ${ctx.gitBranch}`);
  sections.push(`
# Guardrails
- Prefer simple, minimal changes
- Search before creating, and reuse existing patterns
- No new dependencies without asking`);
  if (ctx.projectContext) sections.push(`
# Project Instructions (from AGENTS.md)
${ctx.projectContext}`);
  return sections.join("\n");
}
```
```ts
// call site
const instructions = buildSystemPrompt({
  workingDirectory: cwd,
  sandboxType: "local",
  toolNames: Object.keys(tools),
});
```

**Applies to numa:**
- This is the concrete pattern for the planned multi-tier system: a `buildSystemPrompt(ctx)`-equivalent that takes `toolNames` (varies per subagent: gameplay/visuals/audio each get different tool subsets) and conditionally includes skill content or phase-specific instructions only when relevant — directly reduces the "~250 lines always loaded" cost the engine block currently pays on every turn.
- `sandboxType`/context-conditional sections generalize to a `phase?: "understand" | "design" | "tasks" | "implement" | "verify"` field the orchestrator's prompt builder could branch on, keeping each phase's prompt lean instead of loading the full engine block for every step.
- The "pure function, unit-testable" argument is a strong case for numa to extract its own prompt construction (if not already a pure function) out of the Trigger.dev `chat.agent` task body, so prompt-section regressions can be asserted in tests rather than caught by eyeballing model output.
- Directly reusable: conditionally including `projectContext` only when present is the same shape numa would use for conditionally including a loaded skill's content only when that skill was actually selected for the turn.

## Verification Gates
**Core idea:** Models confidently claim "I fixed the bug" or "all tests pass" as a matter of learned pattern, not malice or evidence — so verification has to be written into the prompt as an explicit contract governing both what the agent runs and how honestly it reports what it did (and didn't) run.

**Key points:**
- The `# Verification` section instructs the agent to: (1) run `npx tsc --noEmit` when TypeScript is present, (2) run lint/test/build **only if they exist in this project and are allowed by the current approval mode** (ties directly to Module 2's `ApprovalConfig`), (3) report exactly what ran, what was blocked, and what was unavailable, (4) never inflate partial verification into a blanket success claim.
- The load-bearing sentence is explicit and negative: **"Do NOT claim 'tests pass' without running them."** Models are described as good at avoiding things named explicitly, bad at avoiding things only implied.
- Contrast table given (bad vs. good agent report), e.g. bad: "All tests pass." / good: "Ran `npm test`: 47 passed, 3 failed (pre-existing, unrelated to my change)." The good column is specific about what was checked, what was found, and where the limits were.
- The section is scoped deliberately: it does **not** make checks pass, and does **not** ask the agent to check everything — it asks the agent to report *accurately* what it did check. "A small honest scope is more useful than a confident-sounding full sweep."
- Confabulation-detection tell given for grading agent output: **hedged future tense** ("should be fine," "looks good to me," "I expect this to work") signals a check that was *not* run; **past tense with a specific result** signals one that was.
- This lesson deliberately hardcodes the verification commands; the very next lesson (Project Context) is flagged as the fix for that, by discovering real commands from `package.json`/`AGENTS.md` instead of guessing `npx tsc`, `npm test`, etc.

**Code patterns:**
```ts
sections.push(`
# Verification
After making changes, verify your work:
1. Run \`npx tsc --noEmit\` when TypeScript is present
2. Run lint, test, or build commands only if they exist in this project and are allowed by the current approval mode
3. Report exactly what you ran, what was blocked, and what was unavailable
4. Do NOT inflate partial verification into a blanket success claim

Do NOT claim "tests pass" without running them.
Scope your claims honestly. "Verification was limited because writes were blocked" is honest.
"All tests pass" when you didn't run them is not.`);
```

**Applies to numa:**
- This is highly relevant to numa's planned verify phase (orchestrator: understand → design → tasks → parallel workers → **verify** → reply) — the verification contract's honesty rules (report ran/blocked/unavailable, no blanket success claims) should be encoded directly into whatever prompt the verify-phase agent/subagent receives.
- The hedged-future-tense vs. past-tense-with-result tell is a concrete, cheap heuristic numa could apply when grading or spot-checking a specialist worker's self-reported completion, before trusting it enough to mark a task done.
- "Only run/report what's allowed by the current approval mode" ties Module 2's `ApprovalConfig` directly to verification reporting — numa's specialists should scope their own verification claims to whatever file/tool access they were actually delegated, not claim broader coverage.
- Not directly applicable as written: numa has no `tsc`/`npm test` execution tool today (no bash/exec tool), so the literal "run tsc, run tests" instructions don't transfer; the transferable part is the *contract shape* (name real checks that exist, scope claims honestly), not these specific commands — numa's equivalent "checks" might be things like "confirm the written file parses" or "confirm the referenced game-toolkit API exists," delegated to whatever verification tool numa ends up building.

## Project Context
**Core idea:** A generic harness needs per-project facts it can't infer from code alone (test runner, architecture, style conventions, past mistakes) — the fix is the now-familiar convention of dropping a markdown file (`AGENTS.md`) in the repo and injecting its contents into the system prompt, the same trick Cursor/Codex/Claude Code/pi each use under a different filename.
<!-- Note: numa's own project already uses this exact convention via @AGENTS.md — this lesson is describing the mechanism numa's own CLAUDE.md/AGENTS.md setup already relies on. -->

**Key points:**
- Mechanism is deliberately minimal: check `existsSync(join(cwd, "AGENTS.md"))`; if present, `readFileSync(..., "utf-8")`; pass the string (or `undefined`) into `buildSystemPrompt` as `projectContext`. The check happens once at startup, not in a hot loop.
- Use `path.join(cwd, "AGENTS.md")` rather than a template literal for the path, for consistent path handling.
- Recommended `AGENTS.md` content categories: **Commands** (exact test/build/lint invocations), **Architecture** (monorepo layout, where shared types live), **Style** (component conventions, export style), **Lessons learned** (project-specific gotchas, e.g. "auth middleware must run before rate limiting," "don't modify migration files directly").
- Explicitly named as the same pattern across tools, with different filenames: Cursor → `.cursorrules`, Codex → `AGENTS.md`, Claude Code → `CLAUDE.md`, pi → its own convention. "The file name varies. The pattern doesn't."
- Scope is deliberately narrow here (one file, one directory, no monorepo walking) — flagged as a stated simplification, with the follow-up challenge being: walk up to `.git` root, collect every `AGENTS.md` along the path, and merge them. Different real harnesses resolve conflicts differently: pi merges everything found, Cursor uses the deepest file only, Codex concatenates root + cwd — the lesson doesn't prescribe one, it flags the tradeoff.

**Code patterns:**
```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const agentsPath = join(cwd, "AGENTS.md");
const projectContext = existsSync(agentsPath)
  ? readFileSync(agentsPath, "utf-8")
  : undefined;

const instructions = buildSystemPrompt({
  workingDirectory: cwd,
  sandboxType: "local",
  toolNames: Object.keys(tools),
  projectContext,
});
```

**Applies to numa:**
- numa's own repo already implements exactly this pattern for the *human developer's* Claude Code session (`CLAUDE.md` → `@AGENTS.md`) — the lesson's monorepo-merge caveat (root + package-level files, conflict resolution) is worth keeping in mind if numa's harness redesign ever needs the *in-sandbox chat agent* (not the dev-time Claude Code session) to read a project-context file from inside the Daytona sandbox for the generated game project itself.
- More directly relevant: numa's system prompt is manually split into workflow/runtime/engine blocks rather than a discovered `AGENTS.md`-equivalent — if any part of the ~250-line engine block is really "facts about this specific game project" rather than universal engine instructions, this lesson argues for moving that part into a discovered, optional, per-sandbox context file instead of a permanently-loaded static block.
- The "commands/architecture/style/lessons-learned" categorization is a good checklist for numa's own AGENTS.md — worth a quick self-check that numa's actual `AGENTS.md` (which governs `db:push` vs `migrate`, and the Next.js version-drift warning) follows the same shape the lesson recommends for a harness-consumed file, since numa's file currently serves a *human/Claude-Code* audience, not necessarily a smaller in-sandbox model.

## Module takeaways for numa
1. Encode the Verification Gates honesty contract (ran/blocked/unavailable, no blanket claims, past-tense-with-result vs. hedged-future-tense) directly into the orchestrator's verify-phase prompt — this is the most concrete, ready-to-port piece for the planned understand → design → tasks → parallel-workers → **verify** → reply pipeline.
2. Extract/confirm a pure `buildSystemPrompt(ctx)`-style function with a `toolNames`/`phase`-conditional section list — this is the direct mechanism for shrinking the always-loaded ~250-line engine block into per-subagent, per-phase, on-demand sections (ties into numa's "skills loaded on demand" goal).
3. Restate tool-usage preferences in both the tool description *and* the system prompt's Agency-equivalent section — cheap, and the course found it necessary even with strong tool descriptions alone.
4. The explicit "act, don't narrate" instruction and the Guardrails-style constraints (minimal changes, reuse, no unflagged new dependencies) are worth auditing numa's workflow block for, since drift toward explaining-instead-of-doing is model-general, not specific to the course's test models.
5. `AGENTS.md`-equivalent discovery-and-injection is a pattern numa already partially uses at the dev-tooling layer; consider whether the in-sandbox chat agent should get its own discovered, optional project-context file for the generated game, separate from the human-facing repo `AGENTS.md`.
6. Lower priority given numa's sandbox model: the monorepo directory-walking/merging discussion and the literal `tsc`/`npm test` verification commands don't transfer as-is — numa's real analog to "run real checks" still needs to be defined once/if a sandbox verification tool exists.
