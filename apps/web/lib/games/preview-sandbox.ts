/**
 * The sandbox flags every game preview runs under, in the one place both
 * enforcement points read them from.
 *
 * The game is model-generated code. `allow-scripts` is what makes it playable,
 * but it is deliberately never paired with `allow-same-origin`: the proxy
 * serves the game from this application's own origin, so together they would
 * let the game reach this app's cookies, storage and authenticated endpoints.
 *
 * The flags are applied twice, and both are needed:
 *
 * - As the iframe's `sandbox` attribute (`components/chat-preview.tsx`), which
 *   only protects the document while it is framed by our page.
 * - As a `Content-Security-Policy: sandbox` header on every proxy response,
 *   which travels with the document itself. Without it, opening a preview URL
 *   directly in a tab runs the game top-level on this origin, with the
 *   session of whoever opened it — and the URL carries a token valid for
 *   hours, so it can be handed to someone else.
 *
 * Inside the frame the two intersect, so keeping them identical means the
 * header changes nothing about how a framed game behaves.
 */
export const PREVIEW_SANDBOX_FLAGS =
  "allow-scripts allow-forms allow-pointer-lock"
