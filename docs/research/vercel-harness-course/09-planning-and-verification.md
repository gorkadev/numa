# Module 9 — Planning and Verification
Source lessons:
- Todo Tool — https://vercel.com/academy/build-ai-agent-harness/todo-tool
- Fast Context Understanding — https://vercel.com/academy/build-ai-agent-harness/fast-context-understanding
- Verification Contract — https://vercel.com/academy/build-ai-agent-harness/verification-contract

## Todo Tool
**Core idea:** A `todo` tool with `add`/`start`/`complete`/`list` actions and an in-memory list, backed by one hard rule the agent can't argue with: only one item can be `in_progress` at a time. That single constraint is what stops the agent from starting five things and finishing none.

**Key points:**
- Actions: `add` (creates item with `crypto.randomUUID().slice(0, 8)` id, `pending` state), `start` (rejects if another item is already `in_progress`, otherwise flips to `in_progress`), `complete` (flips to `completed`), `list` (multi-line string of `[state] id: description`).
- The single-active-item rule is the load-bearing part — without it the agent starts every item up front and races through them in parallel, losing focus.
- State lives in module scope / in-memory only, on purpose: one list per agent run, no persistence across runs, no stale `in_progress` items leaking into a new session where the agent has no memory of why they were started. If you want persistence, snapshot to a file at session end, not mid-session.
- Tool description does real steering work via WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR: "3+ steps, multiple files, or dependencies" vs. "single-file fixes, simple questions, exploratory reads" vs. "status updates to the user (just answer them directly)."
- Rejection message should be specific and instructive: `"Already working on: [id] description. Complete it first."`
- Decision table — plan first: 3+ steps, multiple files, dependencies between changes, multi-part feature request. Skip planner: one file with a known location, a simple question, open-ended exploration, a bug fix with a precise error message.
- Symptom to watch for: if the agent makes a todo list for a one-line typo fix, the tool description is steering too aggressively — tighten WHEN NOT TO USE.
- Suggested extension (not built in the lesson): add `dependsOn: string[]` per item; `start` rejects if any dependency is still pending/in-progress, enabling real ordering ("rename the function" depends on "find every caller").

**Code patterns:**
```ts
interface TodoItem {
  id: string;
  description: string;
  state: "pending" | "in_progress" | "completed";
}
const todos: TodoItem[] = [];

export function createTodoTool() {
  return tool({
    description: `Manage a task list for multi-step work.
WHEN TO USE: tasks with 3+ steps, multiple files, or dependencies between
  changes. Plan once, then track progress as you go.
WHEN NOT TO USE: single-file fixes, simple questions, exploratory reads.
DO NOT USE FOR: status updates to the user (just answer them directly).`,
    inputSchema: z.object({
      action: z.enum(["add", "start", "complete", "list"]),
      description: z.string().optional(),
      id: z.string().optional(),
    }),
    execute: async ({ action, description, id }) => {
      if (action === "start") {
        const active = todos.find((t) => t.state === "in_progress");
        if (active) return `Already working on: [${active.id}] ${active.description}. Complete it first.`;
        // ...
      }
      // add / complete / list ...
    },
  });
}
```

**Applies to numa:**
- Directly the mechanism numa wants for the visible plan/todo list — the single-active-item constraint is a good starting rule for the orchestrator's phase tracking (understand → design → tasks → parallel workers → verify), though numa's "parallel specialist workers" goal means more than one item may legitimately be in progress at once (one per worker) — this lesson's in-memory single-agent model needs adapting, not copying verbatim, for a multi-agent harness.
- The WHEN TO USE / WHEN NOT TO USE steering pattern is directly reusable for numa's own tools to stop the orchestrator from over-planning small tweaks (numa's own routing rule: "small tweak = direct").
- In-memory-only, no cross-session persistence maps well to numa's per-run/per-thread scope, but numa's plan needs to be *player-visible* (a UI concern this lesson doesn't cover) — that's new surface, not in the lesson.

## Fast Context Understanding
**Core idea:** Default "read everything, then act" behavior pollutes context and burns budget; the fix is entirely a system-prompt change — two bullets in the `# Agency` section telling the agent to `grep` first and read only what it will change.

**Key points:**
- The whole fix lives in `src/system.ts`, not in any tool — this is agent *policy*, not a tool capability change. Don't put it in the `grep` tool's own description; it belongs at the agent's action-policy level.
- Two bullets added to `# Agency`:
  - "Search before reading. Use grep first, then read only what you'll change."
  - "Don't read files 'just in case.' Read what you need when you need it."
- Concrete before/after step counts: naive flow on "add rate limiting to auth routes" = ~20+ reads (package.json, tsconfig, every route file, every middleware file...) before implementation even starts. grep-first flow = ~5 steps (grep for the router pattern → read the one match → grep for existing middleware → read that match → implement).
- Once grep narrows the file list, the AI SDK will run parallel tool calls (independent reads) on its own — don't force it; if the agent naturally batches reads, that's a bonus, not a requirement.
- This policy is only as good as the `grep` tool's own result cap — a prior module's 50-match cap is what keeps grep results tight enough that the agent doesn't fall back to reading half the codebase when a pattern is too vague.
- Direct, single-file questions ("what's in src/x.ts?") should skip grep entirely and go straight to `read` — the prompt has to make this conditional explicit or the agent grep-searches even when the answer is already named.
- Open question raised for harder cases: architectural questions ("how is auth handled across the app") don't map to one regex — that's arguably where a tighter-prompted "explorer subagent" (from an earlier module) or a dedicated `survey` tool takes over from `grep`.

**Code patterns:**
```ts
// src/system.ts — Agency section addition
sections.push(`
# Agency
- USE your tools. Read files, search code, run commands, then answer.
- Do NOT explain what you WOULD do. Actually do it.
- Available tools: ${ctx.toolNames.join(", ")}
- Search before reading. Use grep first, then read only what you'll change.
- Don't read files "just in case." Read what you need when you need it.`);
```

**Applies to numa:**
- Directly applicable to numa's chat agent's current tool set (`read_file`, `list_files`, `grep`-equivalent if present, `write_file`, `replace_text`, `delete_file`): if the system prompt doesn't already steer grep-before-read, this is a cheap, high-leverage addition to numa's prompt engine section, independent of the multi-agent harness work.
- Relevant to the planned "skills loaded on demand instead of a ~250-line engine block always in the prompt" goal — the same "don't front-load everything" discipline applies at the knowledge layer (see Module 11 notes) as it does here at the file-reading layer.
- The "survey tool vs. tighter-prompted explorer subagent" open question maps onto numa's own planned phases: the "understand" phase for big changes is exactly this kind of architectural-question exploration, and the lesson's framing (grep doesn't scale to "how does X work" questions) supports giving that phase a dedicated exploration pass rather than ad hoc greps.

## Verification Contract
**Core idea:** The agent should discover the verification gates a specific project actually has (from `package.json` scripts, not a hardcoded list), run them in a sensible order, and report results that explicitly separate failures it caused from failures that were already there — never a blanket "tests pass."

**Key points:**
- `discoverGates(sandbox)` reads `package.json`, checks `scripts.typecheck` / `scripts["type-check"]` / falls back to `npx tsc --noEmit` if TypeScript is a dependency but no typecheck script exists, then `scripts.lint`, `scripts.test`, `scripts.build` — returns only the commands that actually exist for this project. Missing/unreadable `package.json` → empty array, and the agent should say verification is limited rather than fabricate results.
- Ordering rationale: typecheck first (fails fastest), build last (slowest) — later exercise suggests benchmarking actual per-project durations and sorting fastest-first, while noting the tension that some gates are logically dependent on others (build is meaningless if `tsc` fails) and asks how to express that without losing fail-fast behavior.
- The **scoped-claims rule** is called out as the single highest-impact sentence in the whole system prompt: "Distinguish failures you caused from failures that were already there." Example of the wanted output: *"Ran `npm test`: 47 passed, 3 failed. The 3 failures are pre-existing in `user.test.ts` and unrelated to my changes."*
- Explicit anti-pattern table (model's lazy default vs. what the contract demands):
  | Default | Wanted |
  |---|---|
  | "All tests pass." | "Ran `npm test`: 47 passed, 3 failed. The failures are pre-existing in `user.test.ts` and unrelated to my changes." |
  | "The build works." | "Ran `npm run build`: succeeded in 4.2s, no warnings." |
  | "Looks good." | "Ran tsc: passed. Lint not configured. Test suite passed (12 tests)." |
- Hard rule stated directly in the prompt text: "Do NOT claim 'tests pass' without running them. Do NOT inflate partial verification into a blanket success claim."
- The lesson's own framing: gate-discovery code is necessary but not sufficient — "the hardest gate is the agent's honesty," and the protective force is the wording of the system prompt section, not the discovery mechanism. Spend the effort on the prose.
- `verificationCommands: string[]` is threaded through as a new `PromptContext` field, rendered as a numbered list in the `# Verification` section, with an explicit fallback string `"(no verification commands discovered for this project)"` when none exist.

**Code patterns:**
```ts
// src/verification.ts
export async function discoverGates(sandbox: Sandbox): Promise<string[]> {
  try {
    const raw = await sandbox.readFile("package.json");
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts ?? {};
    const gates: string[] = [];
    if (scripts.typecheck || scripts["type-check"]) {
      gates.push("npm run typecheck");
    } else if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
      gates.push("npx tsc --noEmit");
    }
    if (scripts.lint) gates.push("npm run lint");
    if (scripts.test) gates.push("npm test");
    if (scripts.build) gates.push("npm run build");
    return gates;
  } catch {
    return [];
  }
}
```
```ts
// system prompt Verification section
const gates = ctx.verificationCommands?.length
  ? ctx.verificationCommands.map((c, i) => `${i + 1}. \`${c}\``).join("\n")
  : "(no verification commands discovered for this project)";

sections.push(`
# Verification
After making changes, verify your work by running these gates in order:
${gates}

Run each gate, capture the output, and report what passed and what didn't.

Distinguish failures you caused from failures that were already there:
- "Ran tsc: passed."
- "Ran npm test: 47 passed, 3 failed. The 3 failures are pre-existing in user.test.ts and unrelated to my changes."

Do NOT claim "tests pass" without running them. Do NOT inflate partial
verification into a blanket success claim.`);
```

**Applies to numa:**
- This is the piece most directly relevant to numa's open VERIFY-step question. numa's verification target isn't `npm test`/`npm run build` — it's "does the game actually run in the browser" — so `discoverGates` doesn't transplant directly, but the **contract** (discover what's actually checkable, run it, report scoped truthful results) is exactly the shape a game-specific verify step needs: e.g. discover whether the sandbox can boot the dev server, run it headless, and report "console errors: none" vs. "console errors: 2, both pre-existing before this turn's changes" rather than a blanket "it works."
- The scoped-claims rule (never say "it works" without proof, always separate agent-caused vs. pre-existing failures) should be lifted near-verbatim into numa's verify-phase prompt once the headless-run-and-read-console-errors mechanism exists — this is a prompt-wording problem more than an infra problem, per the lesson's own framing.
- Not directly applicable: `package.json` script discovery — numa's games are generated artifacts in a Daytona sandbox, not npm-script-driven projects with typecheck/lint/test/build in the traditional sense, so the "verification target" for numa is closer to "load the page, capture console/render errors" than to CI gates.
- The fail-fast ordering question (typecheck first, build last, gates that depend on each other) is a useful framing for ordering numa's own gates if more than one exists later (e.g. static file-existence checks before a live sandbox boot).

## Module takeaways for numa
1. The scoped-claims verification contract ("distinguish your failures from pre-existing ones," never claim success without running the check) is the single most transplantable idea here — it should shape the prompt for numa's planned headless-run-and-read-console-errors VERIFY step regardless of how that step is implemented.
2. Todo's single-active-item constraint is a good seed for numa's player-visible plan/todo UI, but needs explicit adaptation for the multi-agent case (parallel specialist workers legitimately means more than one "in progress" item).
3. Grep-before-read as an explicit `# Agency` prompt rule is a cheap, independent win for numa's current single-agent chat loop, not gated on the larger harness rework.
4. The "discover what's actually available, don't assume a fixed list" pattern from gate-discovery generalizes to numa's verify step: figure out what can actually be checked in a given sandbox state before claiming any check ran.
