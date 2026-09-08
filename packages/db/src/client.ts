import { drizzle } from "drizzle-orm/node-postgres"
import { parseEnv } from "@neon/env"
import { Pool } from "pg"

import neonConfig from "./neon-policy"
import * as schema from "./schema"

/**
 * `parseEnv` validates the vars already injected into `process.env` against the
 * Neon policy and throws a listing of what is missing when they are absent —
 * which beats a connection error thrown from somewhere deep in a request.
 * Vars are injected by `neon-env run`, so nothing is read from disk here.
 *
 * The pooled URL is correct for application traffic. Migrations use the direct
 * (unpooled) URL instead; see drizzle.config.ts.
 */
const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"])

/**
 * Next.js re-evaluates modules on every hot reload in development, which would
 * leak a connection pool per edit until the branch refuses new connections.
 * Holding the pool on `globalThis` keeps a single one across reloads.
 */
const globalForDb = globalThis as unknown as { pool?: Pool }

/**
 * Neon hands out `?sslmode=require`, which `pg` already treats as an alias for
 * `verify-full` — and warns about, because the next major of
 * `pg-connection-string` will adopt libpq semantics, where `require` encrypts
 * without verifying the certificate. Neon serves a publicly trusted
 * certificate, so the strict mode is the one we want; asking for it by name
 * keeps today's behaviour across that upgrade and silences the warning.
 */
const connectionString = (() => {
  const url = new URL(postgres.databaseUrl)
  url.searchParams.set("sslmode", "verify-full")
  return url.toString()
})()

const pool = globalForDb.pool ?? new Pool({ connectionString })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

export const db = drizzle(pool, { schema })
