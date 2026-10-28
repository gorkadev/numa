# Composer attachments

Objective: attach files in the chat composer as model-only context, stored in a private R2 bucket.
Branch: feat/composer-attachments. Delivery: ask-on-risk. Runner: `node --test` via `pnpm --filter web test` equivalent (`tsx --test`), typecheck, lint.

## Specs

- S1. "con un icono de + q abre el finder nativo de SO q abre el navegador y al seleccionar, lo mostramos con el componente attachment." Following the first example of https://ui.shadcn.com/docs/ai-elements/base/prompt-input.md (hidden file input, `Attachment` chips in a `block-start` addon, remove button).
- S2. "el archivo es unicamente contexto para el modelo." Attachments reach the model; they are never copied into the game sandbox.
- S3. Storage: "crea otro bucket para esto me parece bien" — private bucket `numa-uploads` (env `R2_UPLOADS_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). "el bucket q ya existe, con los assets, no te lies en renombrar ni nada, se queda como esta". Keys are `users/<userId>/<uuid>` so files can be uploaded before a game exists ("como lo guardas entonces si aun no hay juego, con q id?"). Only the owner can read them.
- S4. "q el tema de los archivos no interfiera en la carga de mensajes: lo podemos hacer de manera q la vista cargue aunq los files aun no?" Messages store references only (no bytes); thumbnails load lazily.
- S5. Keyboard: Enter sends, Shift+Enter new line (existing). Sending is blocked while an attachment is still uploading.

## Tasks

- [x] T1 S3 — R2 client, upload route `POST /api/attachments`, read route `GET /api/attachments/[id]`, validation + tests. Route: inline. Risk: item 2 (access control). Commits 5a226c2, 425c109.
- [x] T2 S1 S4 S5 — composer attach button + chips + upload state, send file parts from thread and new-game flows, render attachments in user bubbles. Route: inline. Commit a8bfe9f.
- [x] T3 S2 S3 — agent: keep only attachment-ref file parts, resolve them to bytes from R2 before the model call. Route: inline. Risk: item 2. Commit 442685d.

## Log

- L1 (2026-10-28) "nosotros ya tnemos el chat composer, pero nos falta una cosa: poder adjuntar archivos. esto lo hacemos de manera sencilla, con un icono de + q abre el finder nativo de SO q abre el navegador y al seleccionar, lo mostramos con el componente attachment. literalmente en el link q te adjunto tienes en el primer ejemplo lo necesario te diria, ademas de alguna cosa a tener en cuenta para revisar si lo hacemos (attachments, keyboard) y una explicacion breve para usar con ai sdk, q nos vendra genial. duda: donde se guardan los archivos? en nuestra bd? o tiramos de r2 tambien para esto?"
- L2 "nono, el archivo es unicamente contexto para el modelo." Existing bucket is public via r2.dev, so uploads go to a separate private bucket.
- L3 "a poder ser, q el tema de los archivos no interfiera en la carga de mensajes ... proximamente vamos a meter paginacion". User created bucket + env vars; Cloudflare API token value is not needed (S3 keys only).
- L4 Decision: upload through our own route (multipart, one file per request, server PUT to R2 via aws4fetch) instead of a browser presigned PUT: no bucket CORS needed, size/type enforced server-side. Limit 8 MB per file (proxy body limit is 10 MB). Follow-up: Vercel caps function bodies at 4.5 MB if deployed there.
- L5 Message file parts use `attachment:<uuid>` (AI SDK `convertToModelMessages` does `new URL(part.url)`, which rejects relative URLs); the browser maps it to `/api/attachments/<uuid>`. RED observed for attachments-model and parseAttachmentParts tests before implementation.
- L6 Verified live against dev server + bucket: PNG upload 200 and read-back byte-identical with nosniff; HTML upload 400; foreign id 404; unauthenticated POST redirects to sign-in. Found and fixed: R2 PUT 411 under Next (aws4fetch streamed body) and typeless `.md` arriving as octet-stream. Full suite 474 pass, typecheck and lint clean. Not run: a real model turn with attachments (spends tokens; needs user go-ahead). Trigger.dev worker needs the R2_* env vars (dev reads .env.local; deployed env must be set in the dashboard).
- L7 Independent verifier: no security findings (cross-user reads, SSRF, traversal, XSS all closed). Blocker B1: attachments re-sent in full every turn could exceed the 1M context window. Fix 1 (text cut to 200k chars, 16 MB per-turn byte budget newest-first) rechecked FAIL: text charged by bytes still ~4M tokens. Fix 2 ec529cb: separate per-turn text budget of 400k chars, newest first; reads stop once a budget is spent. Advisories applied: byte-capped worker cache (64 MB), stored file parts rebuilt from known fields, no-owner resolves to notes. Fix 2 verified by unit tests (479 pass), not re-run by the verifier. Remaining advisories: no route-level tests, no per-user upload quota, attachments lost if createGame fails.
