# Agent harness research

Notes gathered while designing numa's multi-agent game-building harness.
Each module file summarises one module of Vercel Academy's
[Build Your Own AI Coding Agent Harness](https://vercel.com/academy/build-ai-agent-harness)
lesson by lesson, with an "Applies to numa" section per lesson.

| # | Module | Most useful for numa |
|---|---|---|
| 01 | [The Agent Loop](01-agent-loop.md) | `ToolLoopAgent` basics, step budgets |
| 02 | [Tool Design](02-tool-design.md) | WHEN TO USE / WHEN NOT TO USE / DO NOT USE FOR descriptions; `needsApproval` without a handler silently skips execution |
| 03 | [The System Prompt](03-system-prompt.md) | `buildSystemPrompt(ctx)` as section arrays; verification honesty contract |
| 04 | [The Sandbox Abstraction](04-sandbox-abstraction.md) | Narrow sandbox interface shared by every agent; lifecycle hooks and `expiresAt` |
| 05 | [Context Management](05-context-management.md) | `pruneMessages` on old tool results; bounded tool output; cache control is provider-specific (Anthropic in the course, not Gemini) |
| 06 | [Subagent Delegation](06-subagent-delegation.md) | Role = tools + model + step budget; executors never ask the user; errors return as strings; `Promise.all` for parallel workers |
| 07 | [Sandbox Lifecycle](07-sandbox-lifecycle.md) | Provider API is the source of truth for sandbox state; hibernation and compute cost |
| 08 | [Human-in-the-Loop](08-human-in-the-loop.md) | Structured questions; numa's suspending `ask_player` is already ahead of the course |
| 09 | [Planning and Verification](09-planning-and-verification.md) | Todo tool; verification contract (never claim unverified success, separate caused vs pre-existing failures) |
| 10 | [Surfaces](10-surfaces.md) | Streaming and rendering tool/subagent parts |
| 11 | [Extensibility](11-extensibility.md) | Skills: name + description always in prompt, body behind a `loadSkill` tool; tool registry and `wrapTool` |

## Reference: gentle-ai

[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is a harness for
coding agents built around delegated SDD phases. The useful parts are its prompt
assets (`internal/assets/`), not its Go code, which is mostly an installer and a
code-review transaction engine.

Worth copying:

- **Coordinator vs executor.** The orchestrator coordinates and never executes;
  phase agents execute and never delegate (`skills/_shared/sdd-phase-common.md`).
- **Artifacts by reference.** Phases read and write artifacts by locator (path or
  key), never by copying bodies into prompts. Each phase declares what it reads
  and writes (`claude/sdd-orchestrator-workflow.md`, "Context Protocol").
- **Uniform result envelope** (`status`, `executive_summary`, `artifacts`,
  `next_recommended`, `risks`), validated by code rather than by the model
  (`internal/sddtaskresult/classify.go`).
- **Gate after every phase**: contract conformance, artifact exists, no
  hallucinated files, no drift from inputs. One retry with specific feedback,
  then stop.
- **Model tier per phase**: strong for explore/design/verify, mid for
  implementation, cheap for transcription-like phases
  (`internal/model/codex_model.go`).
- **Prompts tiered by model capability**: `sdd-apply/SKILL.md` ships a
  model-capable section and a model-small section (fewer files, JSON envelope).
- **Skills injected by exact path**, loaded on demand (`skills/_shared/skill-resolver.md`).
- **Edit authority**: tasks declare the files they touch and implementation is
  blocked outside them (`internal/sddstatus/edit_authority.go`). This is what
  would make parallel writers safe in numa.

Not worth copying: receipt-driven review transactions, PR line budgets,
installer machinery. Note that gentle-ai's phase graph is strictly linear; its
only parallelism is in review lenses.

## Decisions so far

- Build our own harness on AI SDK primitives inside the existing Trigger.dev
  `chat.agent`, rather than adopting the experimental `@ai-sdk/harness`
  `HarnessAgent`. The latter owns conversation history inside the runtime
  session (numa stores history in Postgres), and has no Daytona sandbox provider.
- Route by size: small tweaks are edited directly by the orchestrator; a new
  game or a large feature goes through phases (understand, design, tasks with
  file ownership, parallel specialist workers, verify, reply).
- Subagent token usage is summed into the orchestrator's turn usage, so credits
  cover the whole turn. Today `onTurnComplete`'s `usage` only covers the
  orchestrator's `streamText`.
- Subagent runs get their own view in the thread UI, opened from a slash command
  palette in the composer or a button in the thread header. Design pending.

## Open questions

- Verification: running the game in a headless browser inside the sandbox needs
  a custom Daytona image or snapshot (`daytona.create({ image | snapshot })`)
  with Chromium. The Daytona SDK also ships a `ComputerUse` module, not yet
  evaluated.
- Prompt caching for Gemini on Vertex: the course's cache control is
  Anthropic-specific.
- What happens to sandbox compute while a run is suspended on `ask_player`.
