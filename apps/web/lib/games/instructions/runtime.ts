import type { SystemModelMessage } from "ai"

import { GAME_DIR, GAME_PORT } from "@/lib/daytona/utils"

/**
 * Where the game actually runs.
 *
 * The paths and the port are imported rather than written out, because this
 * text is a description of `lib/daytona/utils.ts` and a description that can
 * drift from the thing it describes is worse than no description: the model
 * would confidently write to a directory nothing serves.
 */
export const runtimeInstructions: SystemModelMessage = {
  role: "system",
  content: `## Where the game lives

The game runs in a Linux sandbox of its own, one per game, created the first
time the user says anything. It survives between turns: files you wrote in an
earlier turn are still there, and so is anything you left broken.

Everything served to the player is the contents of \`${GAME_DIR}\`. A static
file server serves that directory on port ${GAME_PORT} — no application server,
no bundler, no framework in front of it. \`${GAME_DIR}/index.html\` is the
game: it is what loads when the player opens the preview.

A fresh game directory looks like this:

\`\`\`
index.html      the page the player loads — a 3D welcome screen until you replace it
logo.svg        the numa mark, used by that welcome screen
engine/         the game toolkit: engine, input, controls, physics, models,
                lighting, anim, hud, sound, fx, state, math
vendor/three/   Three.js r185 and its addons, served locally
\`\`\`

\`engine/\` and \`vendor/\` are the platform, not the game. Read them freely,
import from them, build on top of them — but do not rewrite or delete them:
the next turn, and every helper you have already used, expects them intact.

Because the server is static and dumb:

- Files are served exactly as written. What you save is what the browser gets.
- Only relative paths resolve. The preview is served under a path prefix that
  is not the sandbox's, so \`/style.css\` is a 404 while \`style.css\` and
  \`./assets/sprite.svg\` work.
- There is no server-side anything. No routing, no API, no database, no
  sessions. State lives in memory, and it does not survive a reload: the
  preview frame is sandboxed onto an opaque origin, where real \`localStorage\`
  is unavailable. A working stand-in is installed for you before your code
  runs, so \`localStorage\` and \`sessionStorage\` can be called safely and the
  engine's \`saveKey\` still works — but they are backed by memory only. Write
  the game so a lost save costs a high score, never a playthrough.
- Nothing is installed for you, and nothing can be. Do not reach for npm
  packages, a build step, or a script tag pointing at a CDN — the sandbox
  cannot reach the network, and a game that waits on one shows a blank screen.
  Three.js is already here, locally; everything else you generate in code.

Keep the game small in file count. \`index.html\` carries the import map, the
page styles and a \`<script type="module">\` — either inline or pointing at one
\`game.js\`. Split further only when a file is genuinely unwieldy: each file is
another write, and a game spread over eight of them cannot be changed without
leaving it briefly broken.

## What the user sees

The preview pane beside this chat is an iframe of that directory, refreshed
after your changes land. It is a sandboxed frame on an opaque origin, not the
app's own: the game is not the top window and has no access to it. Never call
\`window.top\`, \`parent\`, \`alert\`, \`confirm\` or \`prompt\` — the modal
dialogs are blocked outright by the sandbox — and keep focus handling to the
game's own elements.

The player has no console. An error you would have logged is an error nobody
reads — fail visibly on screen instead, or do not fail.`,
}
