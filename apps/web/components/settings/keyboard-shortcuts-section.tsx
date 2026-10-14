"use client"

import { useTranslations } from "next-intl"
import { ItemActions, ItemContent, ItemTitle } from "@workspace/ui/components/item"
import { Kbd } from "@workspace/ui/components/kbd"

import { useIsMac } from "@/hooks/use-is-mac"
import { SHORTCUT_GROUPS } from "@/lib/settings/keyboard-shortcuts"
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-group"

export function KeyboardShortcutsSection() {
  const t = useTranslations("Settings.shortcuts")
  const isMac = useIsMac()
  const modifiers = {
    mod: isMac ? "⌘" : "Ctrl",
    ctrl: isMac ? "⌃" : "Ctrl",
    shift: isMac ? "⇧" : "Shift",
  }

  return (
    <div className="flex flex-col gap-6">
      {SHORTCUT_GROUPS.map((group) => (
        <SettingsGroup
          key={group.title}
          title={t(group.title)}
          description={t(group.description)}
        >
          {group.shortcuts.map((shortcut) => (
            <SettingsRow key={shortcut.label} className="min-w-0 gap-3">
              <ItemContent className="min-w-0">
                <ItemTitle className="whitespace-normal">{t(shortcut.label)}</ItemTitle>
              </ItemContent>
              <ItemActions className="flex shrink-0 flex-wrap justify-end gap-1">
                {shortcut.keys.map((key, index) => (
                  <Kbd key={`${key}-${index}`}>
                    {key in modifiers
                      ? modifiers[key as keyof typeof modifiers]
                      : key}
                  </Kbd>
                ))}
              </ItemActions>
            </SettingsRow>
          ))}
        </SettingsGroup>
      ))}
    </div>
  )
}
