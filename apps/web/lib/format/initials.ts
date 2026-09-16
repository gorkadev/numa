/**
 * The single letter an avatar falls back to when a user has no image.
 *
 * Shared by `NavUser` and `SettingsDialog`, so the dropdown trigger and the
 * dialog it opens always show the same letter.
 */
export function initials(name: string | null | undefined) {
  return (name ?? "?").trim().charAt(0).toUpperCase()
}
