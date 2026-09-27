# Keyboard shortcuts settings

## Objective
Add a read-only keyboard shortcuts section in Settings, using the existing dialog's navigation and visual language. Show implemented app shortcuts with action on the left and keycaps on the right, grouped by usage context. No editing, enabling, or disabling controls.

## Scope and constraints
- Include intentional global shortcuts and composer-specific shortcuts (including send and dismiss dictation), with honest context labels and OS-specific modifier display where applicable.
- Exclude ordinary native text-input behavior and accessibility key handling of individual controls (e.g. profile rename and panel resize arrows).
- Treat the reference as a layout direction, not a requirement to make the existing inert Settings navigation search functional. Do not change shortcut handlers.
- Keep English and Spanish translations consistent with existing i18n conventions; support the existing mobile dialog.
- Next.js 16.2.6 client-components guide read at `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- TDD: off, from `openspec/config.yaml` (`strict_tdd: false`); no configured web test runner. Functional checks: `pnpm --filter web typecheck`, targeted ESLint, and translation JSON checks; runtime UI inspection if available.
- Delivery: one cohesive work-unit commit on `feat/new-flow`; user authorized separate commits and push, no PR.

## Tasks
- [~] KBS-1: Add Settings navigation and a read-only, responsive, translated shortcuts directory that accurately describes implemented global and composer shortcuts. Route: delegated writer (4+ source files; multi-file write). Source outcome and static checks complete; runtime UI check not available. Commit: `5a23348` (`feat(settings): document keyboard shortcuts`).

## Acceptance
- Section is navigable from desktop sidebar and mobile tabs (and URL section validation), lists all intentional app shortcuts without editable or toggle controls.
- Global versus composer/contextual behavior and platform-specific modifiers are accurately represented.
- Existing shortcut handlers remain unchanged; no regressions in Settings navigation.

## Progress
- Exploration: Settings maps through `apps/web/lib/settings/sections.ts` and `apps/web/components/settings-dialog.tsx`; keyboard handlers live across shell, theme, and composer. The existing Settings nav search is presentational and out of scope.
- Implemented in `apps/web/lib/settings/{sections,keyboard-shortcuts}.ts`, `apps/web/components/{settings-dialog,settings/keyboard-shortcuts-section}.tsx`, and `apps/web/messages/{en,es}.json`. No shortcut handlers changed. Review readback confirmed global vs contextual labels and Ctrl+Shift on macOS for dictation/model picker.
- Writer checks passed: `pnpm --filter web typecheck`, targeted ESLint, EN/ES Settings translation parity. Independent verifier reran all three plus `git diff --check`, all passed; parent spot-checked translation parity and diff whitespace. No test runner is configured. Runtime visual/mobile inspection unavailable and skipped. `git diff --check` excludes new untracked files; native assessment returned unassessable because untracked files require explicit declaration, so independent verification was used.
- Next: runtime visual/mobile check when a UI harness is available. Work-unit commit `5a23348` created; push outcome is reported separately from this task document. No PR requested.
