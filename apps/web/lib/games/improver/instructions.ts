import type { TemplateInventoryModel } from "@/lib/games/templates/inventory"

/**
 * `new` improves the prompt that starts a game; `change` improves a message
 * sent inside a game that already exists, which asks for a change to it.
 */
export type ImproverMode = "new" | "change"

const SHARED_RULES = `Rules:
- Reply with the rewritten text only: no preamble, no quotes, no headings, no Markdown.
- Write in the same language as the player's text.
- Keep the player's idea and its scope. Do not add features, modes, levels, shops, leaderboards or story they did not ask for. A precise small game beats a vague big one.
- Be concrete: say what the player sees and does, not how to code it. Never mention files, code, libraries or loaders.
- Never mention a model that is not in the starter template listed below.`

const NEW_GAME = `You turn a player's rough idea into a clear prompt for an AI that builds browser games.

${SHARED_RULES}
- When a starter template is listed, ground the text in it: name the models from its list that fit the idea.
- Fill in only what a playable game needs and the player left open: the controls (keyboard and mouse on desktop, touch on a phone), what the screen shows (score, health, a HUD), how you win or lose, and how to play again.
- Aim for 400 to 900 characters.`

const CHANGE = `The player is inside a game an AI is building for them and wants to change it. Rewrite their message as a clear change request for that game: what should change and how it should behave afterwards.

${SHARED_RULES}
- You cannot see the game, so you do not know which model plays which part. Refer to what already exists in the player's own words ("the enemies", "the player"); name a template model only for something new the player asks to add.
- Do not describe the whole game again and do not turn the message into a new-game prompt.
- Aim for 150 to 500 characters.`

export function improverInstructions(mode: ImproverMode): string {
  return mode === "new" ? NEW_GAME : CHANGE
}

/**
 * The selected template, as content rather than code: its name, its pitch and
 * the models it ships with (ids and animation names). Paths, loaders and
 * verification hooks are left out on purpose — they are the builder's job,
 * and a prompt that repeats them only steers the player's text toward code.
 */
export function improverTemplateContext(
  template:
    | {
        label: string
        tagline: string
        models: readonly TemplateInventoryModel[]
      }
    | undefined
): string {
  if (!template) return ""

  const byCategory = new Map<string, string[]>()
  for (const model of template.models) {
    const category = model.category ?? "other"
    const animations = model.animations?.length
      ? ` (animations: ${model.animations.map((animation) => animation.name).join(", ")})`
      : ""
    byCategory.set(category, [
      ...(byCategory.get(category) ?? []),
      `${model.id}${animations}`,
    ])
  }

  const inventory = [...byCategory.entries()]
    .map(([category, models]) => `- ${category}: ${models.join("; ")}`)
    .join("\n")

  return `Starter template: ${template.label} — ${template.tagline}
Models it ships with, by category:
${inventory}`
}

/**
 * Small models still wrap an answer in quotes or a code fence now and then,
 * and the text goes straight back into the composer, so it is cleaned rather
 * than trusted.
 */
export function cleanImprovedText(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, "")
    .trim()
    .replace(/^["“'](.*)["”']$/s, "$1")
    .trim()
}
