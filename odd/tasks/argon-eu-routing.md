# Argon EU Routing

## Objective and authorization
Fix Argon only, preserving Flash/Lite defaults, cache identity, efforts and pricing. User approved EU routing/local commits (Engram362), then standard-auth correction and bounded real greetings (Engram368). Original profiles: odd/tasks/argon-tier-profiles.md / Engram349.

## Scope
Branch feat/game-templates; AR-1 base f7647b6, AR-2 base bf98b91. Single writer, inherited single-pr strategy. AR-2 forecast50–150diff lines. Source: apps/web/lib/ai/models.ts and models.test.ts; turbo.json only for GOOGLE_VERTEX_PROJECT build/dev environment declarations. Ignored apps/web/.env.local gains only GOOGLE_VERTEX_PROJECT, never committed or exposed. No global routing/dependencies/schema/publishing/console/IAM/billing/login changes. ADC local only; deployment unverified. No further paid probes after the three authorized model requests already executed.

## Tasks
- [x] AR-1 Add regional Argon factory — ebd6806; final evidence bf98b91. Offline verified, but real use revealed express auth ignores location.
- [ ] AR-2 Select standard OAuth for Argon, configure/forward project, verify and commit (in progress).
  - Delegated writer mandatory (source/test/config); ASSESS requires independent verifier. Parent owns commits/progress.
  - Test-first RED/GREEN: API-key suppression, explicit project to URL/OAuth, EU routing; preserve defaults/cache/efforts. No unsafe casts.
  - Checks: five-file focused AI tests via tsx, web typecheck, targeted ESLint, working/staged diff checks, dotenv ignore check.
  - Rollback: AR-2 auth/project settings/tests and local project assignment only; prior profiles/pricing retained.

## Evidence
- AR-1 RED8pass2fail, GREEN10; fixture type failure and unsafe mock cast repaired with MockLanguageModelV4. Final independent mv7589pv-7-rznd PASS10/types/lint/diffs and index identity. ebd6806 152diff lines; no build/fullsuite. DEP0205 warning only.
- Vertex5.0.111/provider-utils5.0.59 auto-select express from env API key; apiKey empty string suppresses env fallback. Explicit location alone insufficient. Local ADC available; active gcloud project matched quota project in diagnostic. Express key project unknown.
- Probe mv76b3nd-a-6vxk: two hola requests, express404 with backend europe-west1 vs ADC eu200 greeting; one OAuth refresh,64tokens/30s/no retries/tools/redirects/fallback. No console change needed locally (Engram369).
- AR-2 writer RED9pass1fail then GREEN11. Offline transitive dependency resolution failure diagnosed separately mv76j3ae-c-r7ss and repaired using Vertex resolved real entry. gcloud PATH issue solved by existing ~/google-cloud-sdk/bin/gcloud. Quota interruption and newline-only config stop resolved; no credential-store rereads.
- Writer mv8khujm-h-rne1 prepended only project assignment, all prior dotenv bytes preserved. PASS11tests/types/lint/diff/ignore. Parent never staged dotenv.
- RDD clone-local off freshly confirmed. AR-2 ASSESS medium+runtime small bias requires independent verifier;118diff lines before final corrections, reviewDue false/under_budget, not consumed.
- Independent mv8kjhzk-i-z4dr PASS11/types/lint/diffs/ignore; source index/worktree match. One actual factory argon-medium greeting eu200 stop Hola,1model+1OAuth,64tokens/30s model/10s OAuth/no retries/tools/redirects. However probe injected temporary GOOGLE_CLOUD_PROJECT alias, so success is qualified, not unmodified-process validation.
- Read-only clarification mv8knaj0-j-43z8: wrapper forwards explicit options.project to GoogleAuth but not environment-loaded GOOGLE_VERTEX_PROJECT. Missing independent project discovery may be tolerated or error; not live-tested. Correct by explicit project from existing env for Argon, not a global alias.
- Writer mv8koadp-k-yw8m observed explicit-project RED9pass2fail then GREEN11; project from existing env now forwarded both to factory URL and GoogleAuth.projectId. Types/diff PASS; new lint environment warning resolved by mv8kqk5r-l-gqst adding only project to Turbo build/dev env. All writer checks PASS with no lint warnings.
- Final independent mv8kry8t-m-j7o6 PASS11tests/types/lint/working+stageddiff/ignore/Turbo JSON assertions. Source+Turbo index/worktree hashes match. Explicit project is cached by GoogleAuth before discovery, so it no longer depends on temporary GOOGLE_CLOUD_PROJECT. No additional network calls; corrected candidate offline verified, not live-tested. No full build/suite, running-worker or deployment verification.
- Parent source spot read confirmed minimal eu/empty-apiKey/explicit-project settings; local commit pending. Documentation-only closure has no meaningful RED; structural diff checks apply.

## Next step
Record local verified work-unit commit. User must restart Next and Trigger to load project configuration, then retry one app message. Exact final candidate and running workers have not been live-tested; deployment credentials remain unverified.
