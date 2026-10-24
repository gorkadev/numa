/** Display-only catalog. These entries do not register keyboard handlers. */
export const SHORTCUT_GROUPS = [
  {
    title: "navigationGroup",
    description: "navigationDescription",
    shortcuts: [
      { label: "newGame", keys: ["mod", "shift", "O"] },
      { label: "search", keys: ["mod", "K"] },
      { label: "settings", keys: ["mod", "shift", ","] },
      { label: "sidebar", keys: ["mod", "B"] },
    ],
  },
  {
    title: "appearanceGroup",
    description: "appearanceDescription",
    shortcuts: [{ label: "toggleTheme", keys: ["D"] }],
  },
  {
    title: "composerGroup",
    description: "composerDescription",
    shortcuts: [
      { label: "sendMessage", keys: ["Enter"] },
      { label: "newLine", keys: ["shift", "Enter"] },
      { label: "dictation", keys: ["ctrl", "shift", "D"] },
      { label: "discardDictation", keys: ["Esc"] },
      { label: "modelPicker", keys: ["ctrl", "shift", "M"] },
      { label: "templatePicker", keys: ["ctrl", "shift", "V"] },
    ],
  },
] as const

type Shortcut = (typeof SHORTCUT_GROUPS)[number]["shortcuts"][number]

/** Every label the catalog knows, for callers that show one shortcut by name. */
export type ShortcutLabel = Shortcut["label"]

const MODIFIERS = {
  mod: { mac: "⌘", other: "Ctrl" },
  ctrl: { mac: "⌃", other: "Ctrl" },
  shift: { mac: "⇧", other: "Shift" },
} as const

/** How one key of a chord is printed; anything that is not a modifier prints as itself. */
export function formatShortcutKey(key: string, isMac: boolean): string {
  if (!(key in MODIFIERS)) return key
  const modifier = MODIFIERS[key as keyof typeof MODIFIERS]
  return isMac ? modifier.mac : modifier.other
}

/** The keys of one catalog entry, so a hint elsewhere cannot drift from the settings list. */
export function shortcutKeys(label: ShortcutLabel): readonly string[] {
  const shortcut = SHORTCUT_GROUPS.flatMap(
    (group): readonly Shortcut[] => group.shortcuts
  ).find((candidate) => candidate.label === label)
  return shortcut?.keys ?? []
}
