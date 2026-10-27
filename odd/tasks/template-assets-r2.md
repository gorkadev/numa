# Template Assets on R2

Objective: template asset bytes live in Cloudflare R2, not in git or the Trigger bundle; each new sandbox still receives a full copy.
Branch: `feat/template-assets-r2`. Delivery: ask-on-risk. Tests: `tsx --test <files>` from `apps/web` (global tsx), plus `pnpm --filter web typecheck` and `lint`.

## Specs

- S1. Move template assets to R2: "mover los templates, assets etc a r2". Bucket `numa-template-assets` in the user's only Cloudflare account. Objects are content-addressed (`blobs/<sha256>`), immutable, cacheable forever.
- S2. Delivery mode chosen by the user: "Copiar al sandbox (Recommended)" — on game creation the sandbox receives the assets downloaded from R2 instead of read from the bundle; game, Files tab, glTF viewer and export keep working as today.
- S3. Each template commits a lock (`seed/ASSETS.lock.json`: path → sha256 + size). Provisioning verifies every downloaded blob against it and fails loudly on mismatch. The lock is not uploaded to the sandbox.
- S4. `readTemplateContract` validates declared asset paths against the lock and never reads asset bytes.
- S5. Asset files leave git and the Trigger `additionalFiles` bundle.
- S6. A script uploads a template's local asset folder to R2 and rewrites its lock, validating glTF dependency closure and manifest animation names before upload (checks that used to live in tests reading the bytes). It can also pull the assets back locally.
- S7. The public base URL is configuration: the bucket's public r2.dev URL is the committed default (not a secret) and `TEMPLATE_ASSETS_URL` overrides it, so a custom domain later is a config change and no environment needs editing now.
- S8. "hazlo todo tú sin pedirme a mi manualmente" — the agent runs the Cloudflare and Trigger setup itself.

## Tasks

- T1 (S3, S4, S5, S6) inline — lock + R2 fetch in seed provisioning, contract without bytes, upload/pull script, tests. Status: done (RED: asset-lock.test.ts module missing; GREEN 4/4).
- T2 (S1, S7, S8) inline — enable public access, upload blobs, write locks. Status: done.
- T3 (S2, S5) inline — remove assets from git and the Trigger bundle. Status: done; real game creation in a deployed Trigger env pending (needs deploy, a user decision).

## Log

- L1 (2026-10-27) user: "okey, podemos hacerlo? mover los templates, assets etc a r2. tengo las skills de cloudflare ya puestas, creo q te pueden servir para hacerlo todo tu sin pedirme a mi manualmente?"
- L2 (2026-10-27) user picked "Copiar al sandbox (Recommended)".
- L3 Evidence: 250 asset files / 36 MB under `templates/*/seed/assets`; Trigger build carries 44 MB of templates; `readTemplateContract` read every asset to validate the manifest (used by agent context and the prompt improver).
- L4 Bucket `numa-template-assets` created (account 1faae259…). Public access via r2.dev (zones available for a later custom domain: gorkadev.com, contentlibrary.xyz).
- L5 Uploaded 251 blobs (cube-world 107, fantasy-cards 70, toon-shooter 74); re-push uploads 0 (idempotent). Public URL https://pub-c9cfca53d8364237968cc4355d3c0f7c.r2.dev.
- L6 Verification: R2 bytes reproduce the approved toon-shooter receipt b5206dc0…; `readGameSeed` for none/cube-world/fantasy-cards/toon-shooter is byte-identical to master (scratch worktree differential); full suite 387 pass (one unrelated intermittent failure seen once, not reproduced in two reruns); typecheck OK; lint 0 errors. Bundled templates 44 MB -> 564 KB.
- L7 Env vars: `.env.local` reads are denied to the agent, so the public URL became a committed default instead of env-only config (S7 rewritten).
