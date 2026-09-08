import { defineConfig } from "@neon/config/v1"

/**
 * Neon Config-as-Code policy.
 *
 * This is the single source of truth for the project's Neon services and
 * branch behaviour. It lives here — rather than at the repo root — because
 * `parseEnv`/`fetchEnv` derive their types from it, so the package that reads
 * the database must be able to import it without crossing a workspace
 * boundary. The root `neon.ts` re-exports this file so the Neon CLI, which
 * discovers config by walking up from the working directory, still finds it.
 */
export default defineConfig({
  // Declare your Neon services here
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {}
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" }
    }
    // Existing branch: no changes
    return {}
  },
})
