"use client"

import { useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { InputGroupAddon } from "@workspace/ui/components/input-group"

import { searchSettings, type SearchableSetting } from "@/lib/settings/search"
import { SECTIONS } from "@/lib/settings/sections"
import { useSearchableSettings } from "@/components/settings/use-searchable-settings"

/**
 * The settings dialog's search box. Results open in a popover under the field
 * rather than replacing the nav, so the sections stay where the reader left
 * them; picking one hands it to `onSelect`, which switches section and
 * scrolls to the row.
 */
export function SettingsSearch({
  onSelect,
}: {
  onSelect: (setting: SearchableSetting) => void
}) {
  const settings = useTranslations("Settings")
  const searchable = useSearchableSettings()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  /** The whole field, icon included, so the popover lines up with its left edge. */
  const anchorRef = useRef<HTMLDivElement>(null)

  const results = useMemo(
    () => searchSettings(searchable, query),
    [searchable, query]
  )
  const hasQuery = query.trim() !== ""

  return (
    <Combobox<SearchableSetting>
      items={results}
      filter={null}
      value={null}
      inputValue={query}
      onInputValueChange={(value) => {
        setQuery(value)
        setOpen(value.trim() !== "")
      }}
      open={open && hasQuery}
      onOpenChange={setOpen}
      autoHighlight
      itemToStringLabel={(setting) => setting.title}
      onValueChange={(setting) => {
        if (!setting) return
        setQuery("")
        setOpen(false)
        onSelect(setting)
      }}
    >
      <div ref={anchorRef}>
        <ComboboxInput
          showTrigger={false}
          placeholder={settings("searchPlaceholder")}
          aria-label={settings("searchAccessibleLabel")}
          className="w-full"
        >
          <InputGroupAddon>
            <HugeiconsIcon
              icon={Search01Icon}
              className="size-4"
              strokeWidth={2}
            />
          </InputGroupAddon>
        </ComboboxInput>
      </div>
      <ComboboxContent anchor={anchorRef} className="w-80">
        <ComboboxEmpty>{settings("searchNoResults")}</ComboboxEmpty>
        <ComboboxList aria-label={settings("searchResultsLabel")}>
          {(setting: SearchableSetting) => {
            const section = SECTIONS.find(
              (entry) => entry.id === setting.section
            )!
            return (
              <ComboboxItem key={setting.id} value={setting} className="pr-2">
                <HugeiconsIcon
                  icon={section.icon}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{setting.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {setting.sectionLabel}
                </span>
              </ComboboxItem>
            )
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
