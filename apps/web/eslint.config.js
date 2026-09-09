import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
  {
    // Seed files copied verbatim into each game sandbox. They are assets, not
    // source: nothing here imports them, and they are authored against the
    // sandbox's static server rather than this app's toolchain.
    // `.trigger` is the CLI's build scratch directory: symlinked, transient,
    // and often pointing at files that no longer exist by the time ESLint
    // walks it.
    ignores: ["lib/games/runtime/**", ".trigger/**"],
  },
  ...nextJsConfig,
]
