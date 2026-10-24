/**
 * The Polar `externalId` of one turn's usage event, which Polar uses to drop
 * duplicates.
 *
 * It includes the run because `turn` alone is not unique within a game: the
 * Trigger.dev chat loop restarts its counter at 0 in every run, and a chat gets
 * a new run after an idle timeout or a redeploy (a continuation). With
 * `gameId:turn` the first turns of a continuation reused keys an earlier run had
 * already spent, and Polar silently discarded them as duplicates: the user was
 * never charged. A retry of the same run keeps the same `runId`, so the key is
 * still stable across retries, which is what it exists for.
 */
export function turnEventKey({
  gameId,
  runId,
  turn,
}: {
  gameId: string
  runId: string
  turn: number
}): string {
  return `${gameId}:${runId}:${turn}`
}
