/**
 * A URL that is safe to put in an `href`, or nothing.
 *
 * Everything the agent writes ends up rendered as markdown, and markdown turns
 * `[click me](javascript:…)` into a real link. The model is not the attacker
 * here — the player's own prompt is, since it reaches the model verbatim and
 * the model repeats what it is told. Allowing only http(s) is what keeps a
 * `javascript:` or `data:` scheme from becoming a clickable element in the
 * thread.
 *
 * Returns `undefined` rather than throwing or substituting a placeholder: the
 * caller decides whether a link it cannot trust becomes plain text or is
 * dropped, and both answers are reasonable.
 */
export function safeHttpUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined

  try {
    const { protocol } = new URL(url)

    return protocol === "http:" || protocol === "https:" ? url : undefined
  } catch {
    return undefined
  }
}
