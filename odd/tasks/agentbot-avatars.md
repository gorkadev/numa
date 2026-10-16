# AgentBot avatars

## Objective and scope
Give six specialists stable distinct Blobatar identities in chat entries, panel rows and detail headers. Preserve main Numa avatar and status labels/icons. No database changes or cursor tracking.

## Accepted presentation
- explorer/Scout: turquoise, organic (.35).
- planner/Architect: violet, hexagon (.93).
- gameplay/Builder: blue, boxy (.54).
- visuals/Artist: coral, sun (.965).
- audio/Composer: amber, droplet (.89).
- verifier/Tester: green, capsule (.65).
- Stable role seed and explicit hue/tone; shape values verified against installed core 2.7.0.
- running=thinking/always; done=happy/hover; partial and blocked=unsure/hover; error=sad/hover; aborted and skipped=idle/hover; unavailable=sleepy/hover.
- Local rendering, decorative accessibility, reduced-motion stylesheet support.

## Tasks
- [x] T1 Implement shared AgentBot and integrations with focused tests. Delegated writer; code and automated checks complete.
- [x] T2 Independently verify code and record UI limitations. Delegated verifier; all requested commands pass, no correctness defects found. Overall visual verification remains partial as detailed below.
- [ ] T3 Manually validate six identities and hover/running/reduced-motion behavior in authenticated browser. Pending: browser automation unavailable; do not claim visually verified.

## Verification evidence
Historical implementation checks; delivery validation now also passes the combined 12-test suite, focused ESLint, web typecheck and whitespace checks.
- RED: node --test apps/web/components/chat/agent-bot.test.ts failed with missing presentation module before implementation.
- GREEN and independent rerun: same command passes 3 tests; parent also reran, 3 passed.
- pnpm --filter web typecheck: PASS (initial focusable typing issue resolved with boolean false).
- pnpm --filter web exec eslint components/chat/agent-bot-presentation.ts components/chat/agent-bot.test.ts components/chat/agent-bot.tsx components/chat/subagent-entry.tsx components/chat/subagent-panel.tsx components/chat/subagent-run-detail.tsx 'app/[locale]/layout.tsx': PASS.
- git diff --check: PASS.
- SSR test renders installed library with helper props, not TSX wrapper; wrapper verified by independent direct inspection.
- Integrations independently confirmed: subagent-entry.tsx:106, subagent-panel.tsx:105, subagent-run-detail.tsx:143; motion CSS locale layout line 8.
- User explicitly approved apps/web/app/[locale]/layout.tsx for motion CSS import after originally scoped global entry paths proved absent.
- Browser check unavailable: Playwright CLI absent; Orca stopped; localhost:3000 returns 307 to /sign-in. No service started. Full production build not run.
- Independent verifier mv8sj0p3-5-ueku completed with PARTIAL solely for browser limitation; no source defects found.

## Delivery and risk
Branch: feat/agentbot-avatars. Dependencies blobatar and @blobatar/react 2.7.0. Strategy ask-on-risk; forecast 200-350 authored diff lines, actual 154 excluding lockfile. User has now explicitly authorized scoped commits and push. Committed as d8a3b49 together with localized specialist metadata because their UI integrations share files. Published to origin/feat/agentbot-avatars; no PR requested.
Native RDD off; no review started. ASSESS unassessable due to untracked new files; treated as high with independent verification completed. No authority maintenance attempted.

## Next step
Manual authenticated browser validation (T3) remains pending; committed work is published.
