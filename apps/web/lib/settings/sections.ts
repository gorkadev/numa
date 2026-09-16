import {
  CreditCardIcon,
  Settings02Icon,
  ShieldKeyIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

/**
 * The settings dialog's sections, and the one place their ids, labels and
 * icons are spelled out.
 *
 * Split out of `settings-dialog.tsx` so `hooks/use-settings-dialog.ts` can
 * validate a URL's `?settings=` value against this same list without a
 * client hook importing a client *component* file just to reach a type and
 * a lookup table.
 */
export type SectionId = "general" | "account" | "security" | "billing"

export type Section = {
  id: SectionId
  label: string
  icon: IconSvgElement
}

/**
 * The nav's sections, in the groups the sidebar renders them under.
 *
 * Grouping is the structure, not a decoration on top of a flat list: with
 * four sections a single column already reads as "four unrelated rows", and
 * the moment a fifth lands (workspace, integrations, notifications) a reader
 * has no way to tell which of them are about *them* and which are about the
 * account being paid for. The labels are the answer to that, so they live
 * with the sections rather than in the component that paints them.
 */
export const SECTION_GROUPS: { label: string; sections: Section[] }[] = [
  {
    label: "Personal",
    sections: [
      { id: "general", label: "Preferences", icon: Settings02Icon },
      { id: "account", label: "Profile", icon: UserCircleIcon },
      { id: "security", label: "Security & access", icon: ShieldKeyIcon },
    ],
  },
  {
    label: "Billing",
    sections: [
      { id: "billing", label: "Plan & credits", icon: CreditCardIcon },
    ],
  },
]

/**
 * Every section, flattened, for the lookups that do not care about groups —
 * the mobile `<select>`, the active-section lookup, and `isSectionId`.
 */
export const SECTIONS: Section[] = SECTION_GROUPS.flatMap(
  (group) => group.sections
)

/** The section a bare `?settings` or an unrecognized value falls back to. */
export const DEFAULT_SECTION_ID: SectionId = SECTIONS[0]!.id

export function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((section) => section.id === value)
}
