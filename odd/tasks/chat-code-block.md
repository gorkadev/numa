# Migrate chat code rendering to shadcn CodeBlock

## Scope and delivery

Fully replace old react-shiki/custom clipboard with generated useHighlightedCode and shared CodeBlock/Header/Title/Actions/Content/Line/CopyButton. Numbered lines, localized wrap/copy, inline code and real Markdown handling. No fake filename/download, terminal events or icon sweep. User rejected shell-only approach. Branch feat/chat-activity-trace; necessary dependency migration authorized, no staging/commit/push/PR. Preserve concurrent user styles/icons and original index.

## Task

- [ ] C1 — Full migration and checks. In progress: implementation complete, intermittent highlighter test failure under diagnosis; browser checks pending. Delegated writer and independent verification. Commit none.

## Implemented and verified

Writer mvb70yi5-e-iogu removed legacy renderer/dependency/custom copy, added direct web Shiki, local inline-detection HAST plugin, full Content/Line/CopyButton composition, localized wrap/copy labels, real highlighter/hook/Markdown tests. Existing generated hook/highlighter source unchanged. Three intended RED failures preceded GREEN14/14. Web typecheck now PASS, resolving earlier20 errors. Web/UI ESLint, TS formatting, whitespace and locale recursive parity passed independently. Zero react-shiki references. Index SHA256 unchanged:90081f06fc42ef1f2c87da6998844ae7089b65bf22305aa06ab1da2e81711083. No staging/commits. Parent inspected renderer and repeated whitespace check.

## Unresolved intermittent failure

Independent verifier mvb761q4-g-o7d0 first observed13/14: highlighter alias test compares TS vs typescript, both canonicalize to typescript. Light-theme colors after value differed (alias inherited #005CC5; canonical #24292E/#D73A49/#032F62); dark colors/classes matched. Isolated highlighter2/2 and full14/14 reruns passed without edits. Passing reruns do not resolve the first failure; assertions were not weakened. Parent earlier relayed JS/javascript shorthand from verifier incorrectly; TS/typescript is the corrected evidence.

Read-only scout mvb78gg9-h-8uvg confirmed alias canonicalization but could not establish root cause. Runtime verifier mvb7aop0-i-gdfg executed one bounded probe batch: installed primitive4.5.0 and4.4.3 both default tokenizeTimeLimit=500 and pass it to tokenizeLine2; no evidence original failure exhausted it or of early-stop handling. Eight runtime alias comparisons all matched (first71ms, later0–1ms); strict highlighter tests2/2 passed. No code/assertion changes. Timeout/load-order/state causes remain unproven; no speculative fix applied. All delegated work settled; nothing is still running.

## Other limits

Native assessment unassessable due untracked scope; independent high-risk fallback used. RDD off. Browser clipboard/wrap/theme/streaming/scroll remain unverified (tooling unavailable). Previous Trace historical UI human-confirmed; live checks pending.

User concurrently adjusted renderer background (bg-accent/ then bg-input) and subagent icons; worker wrote bg-background and did not edit subagent-entry. Preserve user's current styles; don't attribute changes to migration.

## Next step

Migration is implemented, but do not declare C1 fully verified: one unexplained intermittent color mismatch and browser checks remain open. Stop repeated reruns or speculative changes; retain strict test and evidence for targeted reproduction if it recurs. Next practical check is real-browser highlighting/wrap/copy/theme/streamed growth. Commit only on explicit request.
