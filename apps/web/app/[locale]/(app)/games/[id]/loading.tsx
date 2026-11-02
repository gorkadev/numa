/**
 * Empty on purpose. Without a boundary here the home screen's `(app)/loading`
 * would cover the chat during a move, and a move commits at once only with one.
 * The first visit's skeleton is `GameRoute`'s, so there is exactly one.
 */
export default function Loading() {
  return null
}
