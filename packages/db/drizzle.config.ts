import { defineConfig } from "drizzle-kit"

/**
 * Schema changes are applied with `pnpm db:push`, which diffs src/schema.ts
 * against the live branch. Migration files are deliberately not used while the
 * project is in development — see AGENTS.md.
 *
 * `push` issues DDL, so it needs the DIRECT (unpooled) connection. The pooled
 * endpoint routes through PgBouncer in transaction mode, which drops the
 * session state DDL relies on — and fails in ways that never mention pooling.
 *
 * Run through `neon-env run --` so the var is present; `pnpm db:push` does that.
 */
const url = process.env.DATABASE_URL_UNPOOLED

if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. Run drizzle-kit via `pnpm db:push` from the repo root, which injects it with neon-env.",
  )
}

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
})
