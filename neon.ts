/**
 * Neon CLI discovery anchor.
 *
 * The CLI resolves `neon.ts` by walking up from the working directory, so the
 * file has to sit at the repo root. The policy itself lives in `@workspace/db`
 * so application code can import it for typed env without reaching outside its
 * own package.
 */
export { default } from "@workspace/db/neon-policy"
