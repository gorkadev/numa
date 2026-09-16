"use client"

import { useTheme } from "next-themes"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupCard,
} from "@workspace/ui/components/radio-group"
import { cn } from "@workspace/ui/lib/utils"

/**
 * A miniature of what the interface looks like in one mode.
 *
 * # Why the colors are literal instead of theme tokens
 *
 * Every other surface in this application paints itself with `bg-muted`,
 * `text-foreground` and friends, which resolve to whatever theme is active.
 * This one must show all three answers AT ONCE while only one of them is
 * active — a token-driven preview would render three identical cards. So the
 * two palettes are spelled out here, and this component is the one place in
 * the app where that is correct rather than a shortcut.
 */
function ThemePreview({ mode }: { mode: "light" | "dark" }) {
  const dark = mode === "dark"

  return (
    <div
      className={cn(
        "flex h-full flex-col p-3",
        dark ? "bg-neutral-900" : "bg-neutral-100"
      )}
    >
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-lg p-2.5",
          dark ? "bg-neutral-800" : "bg-white"
        )}
      >
        <span
          className={cn(
            "text-sm font-medium",
            dark ? "text-neutral-100" : "text-neutral-900"
          )}
        >
          Aa
        </span>
        <div
          className={cn(
            "h-1.5 w-3/4 rounded-full",
            dark ? "bg-neutral-700" : "bg-neutral-200"
          )}
        />
        <div
          className={cn(
            "h-1.5 w-1/2 rounded-full",
            dark ? "bg-neutral-700" : "bg-neutral-200"
          )}
        />
      </div>
    </div>
  )
}

/**
 * The three options, in the order they read: the deferred choice first, then
 * the two explicit ones.
 *
 * "System" is the light preview with the dark one laid over its right half —
 * the same trick the macOS and Linear pickers use, and the only honest way to
 * draw "whichever of these two your device says".
 */
const OPTIONS = [
  {
    value: "system",
    label: "System",
    preview: (
      <>
        <ThemePreview mode="light" />
        <div className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
          <ThemePreview mode="dark" />
        </div>
      </>
    ),
  },
  { value: "light", label: "Light", preview: <ThemePreview mode="light" /> },
  { value: "dark", label: "Dark", preview: <ThemePreview mode="dark" /> },
]

/**
 * The theme selector: three previews, picked like radio buttons because that
 * is exactly what they are.
 *
 * `RadioGroupCard` (in the UI package) carries the selection affordance — the
 * ring and the check badge — so nothing here re-implements what "selected"
 * looks like. Wrapping each option in a `Label` is what makes the caption
 * under the card part of its hit area: Base UI's radio renders a real
 * `input[type=radio]`, so the native label-to-input association does the work
 * with no `htmlFor` plumbing.
 *
 * `theme` is `undefined` until next-themes has read the stored preference on
 * the client, so the group is passed `null` in the meantime rather than an
 * empty string — that is how Base UI spells "nothing selected", and it keeps
 * the group controlled for its whole life instead of switching modes on
 * hydration.
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()

  return (
    <RadioGroup
      className="grid-cols-3 gap-4"
      aria-label="Theme"
      value={theme ?? null}
      onValueChange={(value) => setTheme(String(value))}
    >
      {OPTIONS.map((option) => (
        <Label key={option.value} className="group flex flex-col gap-2">
          <RadioGroupCard value={option.value} className="aspect-[4/3]">
            {option.preview}
          </RadioGroupCard>
          <span className="text-muted-foreground group-has-data-checked:text-foreground">
            {option.label}
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}
