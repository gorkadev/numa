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

- [ ] T1 S3 — R2 client, upload route `POST /api/attachments`, read route `GET /api/attachments/[id]`, validation + tests. Route: inline. Risk: item 2 (access control).
- [ ] T2 S1 S4 S5 — composer attach button + chips + upload state, send file parts from thread and new-game flows, render attachments in user bubbles. Route: inline.
- [ ] T3 S2 S3 — agent: keep only attachment-ref file parts, resolve them to bytes from R2 before the model call. Route: inline. Risk: item 2.

## Log

- L1 (2026-10-28) "nosotros ya tnemos el chat composer, pero nos falta una cosa: poder adjuntar archivos. esto lo hacemos de manera sencilla, con un icono de + q abre el finder nativo de SO q abre el navegador y al seleccionar, lo mostramos con el componente attachment. literalmente en el link q te adjunto tienes en el primer ejemplo lo necesario te diria, ademas de alguna cosa a tener en cuenta para revisar si lo hacemos (attachments, keyboard) y una explicacion breve para usar con ai sdk, q nos vendra genial. duda: donde se guardan los archivos? en nuestra bd? o tiramos de r2 tambien para esto?"
- L2 "nono, el archivo es unicamente contexto para el modelo." Existing bucket is public via r2.dev, so uploads go to a separate private bucket.
- L3 "a poder ser, q el tema de los archivos no interfiera en la carga de mensajes ... proximamente vamos a meter paginacion". User created bucket + env vars; Cloudflare API token value is not needed (S3 keys only).
- L4 Decision: upload through our own route (multipart, one file per request, server PUT to R2 via aws4fetch) instead of a browser presigned PUT: no bucket CORS needed, size/type enforced server-side. Limit 8 MB per file (proxy body limit is 10 MB). Follow-up: Vercel caps function bodies at 4.5 MB if deployed there.
