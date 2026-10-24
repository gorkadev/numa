import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"

/** The theme choices menus offer, each with its `Settings` label key and icon. */
export const THEMES = [
  { value: "light", label: "lightTheme", icon: Sun03Icon },
  { value: "dark", label: "darkTheme", icon: Moon02Icon },
  { value: "system", label: "systemTheme", icon: ComputerIcon },
] as const
