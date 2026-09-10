import {
  DEFAULT_GAME_MODEL_ID,
  isGameModelId,
  type GameModelId,
} from "./model-catalog"
import { gameModel } from "./models"

/**
 * What to build with when the browser did not say, or said something this
 * server does not recognise.
 *
 * The id is checked again here even though `clientDataSchema` already parsed
 * it, because the fallback is the point: a turn arriving from an older tab, or
 * from a client sending nothing at all, should be answered with the default
 * model rather than failing. The schema decides what is *allowed*; this decides
 * what to do when the answer is missing.
 *
 * Exported rather than kept inside `gameModelSettings` because two callers need
 * the *decision* and only one needs the provider it leads to: the cost ledger
 * records which model ran, and it has to reach that answer by this rule and no
 * other. Re-deriving the fallback at the second call site would work until the
 * day this rule changed, and then quietly file every defaulted turn under the
 * wrong model.
 */
export function resolveGameModelId(id: GameModelId | undefined): GameModelId {
  return isGameModelId(id) ? id : DEFAULT_GAME_MODEL_ID
}

/**
 * Turns whatever the browser said it wanted into the `streamText` options for
 * this turn.
 */
export function gameModelSettings(id: GameModelId | undefined) {
  return { model: gameModel(resolveGameModelId(id)) }
}
