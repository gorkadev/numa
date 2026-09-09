import { additionalFiles } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_wzxlordmklnixpvuqrmu",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["trigger"],
  // Makes the working directory the build directory in dev, as it already is
  // in a deploy. `readRuntimeSeed` resolves the runtime folder against
  // `process.cwd()`, so without this the same code would look in two different
  // places depending on where it ran.
  legacyDevProcessCwdBehaviour: false,
  build: {
    // Nothing imports the sandbox runtime files, so the bundler cannot see
    // them — they are data copied into each new sandbox, not modules. This
    // glob is what puts them beside the deployed task, at the same path they
    // have in the repo.
    extensions: [additionalFiles({ files: ["./lib/games/runtime/**"] })],
  },
})
