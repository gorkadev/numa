import {
  DEFAULT_GAME_MODEL_ID,
  isGameModelId,
  type GameModelId,
} from "./model-catalog"
import { gameModel } from "./models"

/**
 * Turns whatever the browser said it wanted into the `streamText` options for
 * this turn.
 *
 * The id is checked again here even though `clientDataSchema` already parsed
 * it, because the fallback is the point: a turn arriving from an older tab,
 * or from a client sending nothing at all, should be answered with the default
 * model rather than failing. The schema decides what is *allowed*; this decides
 * what to do when the answer is missing.
 */
export function gameModelSettings(id: GameModelId | undefined) {
  const resolved = isGameModelId(id) ? id : DEFAULT_GAME_MODEL_ID

  return { model: gameModel(resolved) }
}
