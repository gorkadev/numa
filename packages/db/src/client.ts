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

const pool =
  globalForDb.pool ?? new Pool({ connectionString: postgres.databaseUrl })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

export const db = drizzle(pool, { schema })
