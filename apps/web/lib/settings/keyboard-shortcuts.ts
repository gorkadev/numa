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
    ],
  },
] as const
