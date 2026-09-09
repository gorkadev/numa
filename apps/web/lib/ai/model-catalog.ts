import { z } from "zod"

/**
 * The models a player may build a game with, and everything the browser is
 * allowed to know about them.
 *
 * Client-safe on purpose: this module holds ids and copy, never a provider
 * instance. A picker imports it, the chat sends the chosen id up as client
 * data, and the agent is the only place that turns that id into something that
 * can call Vertex — see `./models`. Keeping the two apart is what stops a
 * credentialed provider from being pulled into a client bundle by an import of
 * the label next to it.
 */
export type GameModel = {
  id: GameModelId
  name: string
  /** One line, shown under the name in a picker. */
  tagline: string
}

/**
 * The ids, as their own schema rather than a derived one.
 *
 * This is the validator the agent runs against `clientData`: the id arrives
 * from the browser, so the set of models a game can be built with has to be
 * closed on the server, not merely typed.
 */
export const gameModelIdSchema = z.enum([
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
])

export type GameModelId = z.infer<typeof gameModelIdSchema>

export const GAME_MODELS: readonly GameModel[] = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    tagline: "Fast and capable. The right pick for most games.",
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    tagline: "Slower and stronger, for mechanics that need real reasoning.",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    tagline: "Cheapest and quickest, for small tweaks and quick iterations.",
  },
]

/**
 * What a game is built with until somebody chooses otherwise — the balanced
 * option, not the cheapest, because the first turn is the one that decides
 * whether the player keeps going.
 */
export const DEFAULT_GAME_MODEL_ID: GameModelId = "gemini-3.8-flash"

export function isGameModelId(value: unknown): value is GameModelId {
  return gameModelIdSchema.safeParse(value).success
}

export function getGameModel(id: GameModelId): GameModel {
  const model = GAME_MODELS.find((candidate) => candidate.id === id)

  /**
   * Unreachable through the type, but `GAME_MODELS` and the schema are two
   * lists that have to be kept in step by hand — so a model added to one and
   * not the other fails here rather than rendering a blank row.
   */
  if (!model) throw new Error(`Unknown game model: ${id}`)

  return model
}
