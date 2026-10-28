import type { SectionId } from "@/lib/settings/sections"

export const SETTINGS_PARAM = "settings"

/** A row to scroll to once the section is open; read once, then dropped. */
export const SETTING_PARAM = "setting"

/**
 * The query string for a settings dialog state. A setting only rides along
 * when one is given, so any later section change or close drops it.
 */
export function settingsParams(
  current: URLSearchParams,
  section: SectionId | null,
  setting?: string
): URLSearchParams {
  const params = new URLSearchParams(current.toString())
  params.delete(SETTING_PARAM)

  if (section === null) {
    params.delete(SETTINGS_PARAM)
    return params
  }

  params.set(SETTINGS_PARAM, section)
  if (setting) params.set(SETTING_PARAM, setting)
  return params
}
