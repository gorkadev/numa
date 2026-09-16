"use client"

import { useState } from "react"
import Link from "next/link"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import type { BillingSummary } from "@/lib/polar/plan"
import {
  SECTION_GROUPS,
  SECTIONS,
  type SectionId,
} from "@/lib/settings/sections"
import { ProfileSection } from "@/components/settings/profile-section"
import { SecuritySection } from "@/components/settings/security-section"
import {
  SettingsGroup,
  SettingsHeading,
  SettingsRow,
} from "@/components/settings/settings-group"
import { ThemePicker } from "@/components/settings/theme-picker"

/**
 * The plan label shown next to a user's plan.
 *
 * Copied verbatim from `credits-button.tsx` rather than imported, because
 * that file folds the same ternary directly into JSX with no exported
 * function to call — see the long note on `BillingPlan` in `lib/polar/plan.ts`
 * for why `"none"` is handled as an absence rather than a fourth label here.
 */
function planLabel(plan: BillingSummary["plan"]) {
  return plan === "max" ? "Max" : plan === "pro" ? "Pro" : "Free"
}

/**
 * A settings surface shaped like the ChatGPT / Claude.ai settings modal: a
 * left section nav and a right content panel inside one dialog, rather than
 * a dedicated route. There is nothing here yet that needs to be linkable or
 * to survive a refresh, so a modal avoids standing up `/settings` pages for
 * three rows apiece.
 *
 * # Why the nav is a `Sidebar` with no `SidebarProvider` of its own
 *
 * `Sidebar collapsible="none"` only needs *a* sidebar context to exist above
 * it — it calls `useSidebar()` unconditionally before branching on
 * `collapsible`. Wrapping it in a fresh `SidebarProvider` here would seem
 * like the obvious fix, but that component also binds a window-level
 * Cmd/Ctrl+B handler and writes the `sidebar_state` cookie (see
 * `sidebar.tsx`), so a second instance would fight the app's own sidebar
 * over that cookie and that shortcut. This is rendered from
 * `components/app-settings.tsx`, mounted once in `app/(app)/layout.tsx` —
 * already inside the app shell's `SidebarProvider` — and a dialog's portal
 * moves where content paints in the DOM, not where it sits in the React
 * tree, so `useSidebar()` here finds that same outer context for free.
 *
 * # Why `open` and `section` are props, not local state
 *
 * Both are owned by `hooks/use-settings-dialog.ts`, which reads and writes
 * them through the URL's `?settings=` query param rather than this
 * component holding its own `useState`. See that hook's doc comment for
 * why: the dialog has to open the same way whether it is triggered from
 * `NavUser`'s dropdown item or the global keyboard shortcut, and those live
 * in components that do not share a parent close enough to lift state
 * into — the URL is the only thing both can read and write without one
 * silently going stale.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  section,
  onSectionChange,
  billing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: SectionId
  onSectionChange: (section: SectionId) => void
  billing: BillingSummary
}) {
  /**
   * The section this dialog PAINTS, which is not always the one it is given.
   *
   * `open` and `section` are derived from the same `?settings=` value (see
   * `hooks/use-settings-dialog.ts`): closing deletes the param, so in that one
   * render `open` goes false AND `section` falls back to the default at the
   * same time. The dialog is still mounted through its closing animation, so
   * it would spend those frames showing the first section — a visible flash of
   * "Preferences" on the way out of every other section.
   *
   * Holding the last section the dialog was actually OPEN on fixes it at the
   * source: while closing there is no new section to follow, so it keeps
   * painting the one the user was looking at until it is gone. Adjusted
   * during render rather than in an effect, which is React's documented way
   * to derive state from props that changed — an effect would render the
   * wrong section first and only then correct it, which is the flash again.
   */
  const [shownSection, setShownSection] = useState(section)

  if (open && section !== shownSection) setShownSection(section)

  const activeSection = SECTIONS.find((entry) => entry.id === shownSection)!

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[560px] md:max-w-[760px] lg:max-w-[880px]">
        {/**
         * `min-w-0` is load-bearing, not tidiness. This is a grid item of
         * `DialogContent`, and grid and flex items both default to
         * `min-width: auto` — they refuse to shrink below their content's
         * intrinsic width. The mobile tab strip below is ~594px of tabs, and
         * even though its own wrapper scrolls, that intrinsic width still
         * propagates up here and stretches the whole pane past the dialog,
         * which then clips it with `overflow-hidden`: on a phone the rows'
         * right-hand side (avatar, inputs, email) simply disappeared.
         * `min-w-0` lets this shrink to the dialog and leaves the overflow to
         * the one element equipped to scroll it.
         */}
        <div className="flex min-w-0 flex-col md:h-[560px] md:flex-row">
          {/**
           * `w-60` (unprefixed) replaces the default `w-(--sidebar-width)`
           * outright rather than fighting it at `md`: this pane's width is
           * fixed by the dialog's own layout, not by the app sidebar's
           * collapsible width. `hidden md:flex` is the mobile fallback the
           * plan calls for — the section switcher below takes its place.
           */}
          <Sidebar
            collapsible="none"
            className="hidden w-60 shrink-0 border-r border-border bg-sidebar md:flex"
          >
            <SidebarContent className="gap-0">
              {/**
               * Presentational for now: no `onChange`, no filtering. It is
               * here because the nav's shape is what this pass is about, and
               * a search field changes where the eye lands and how much
               * vertical room the groups get — decisions that are cheaper to
               * make now than after the groups are tuned around its absence.
               */}
              <div className="px-2 py-4">
                <InputGroup>
                  <InputGroupAddon>
                    <HugeiconsIcon
                      icon={Search01Icon}
                      className="size-4"
                      strokeWidth={2}
                    />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search..."
                    aria-label="Search settings"
                  />
                </InputGroup>
              </div>

              {SECTION_GROUPS.map((group) => (
                <SidebarGroup key={group.label} className="py-1">
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.sections.map((entry) => (
                        <SidebarMenuItem key={entry.id}>
                          <SidebarMenuButton
                            isActive={shownSection === entry.id}
                            onClick={() => onSectionChange(entry.id)}
                          >
                            <HugeiconsIcon icon={entry.icon} strokeWidth={2} />
                            <span>{entry.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>

          {/**
           * The right pane is a `Tabs` root purely so the mobile strip below
           * is a real tablist with a real panel rather than a row of buttons
           * dressed as tabs. `gap-0` undoes the root's own spacing — this is
           * a layout column, not a tabs widget with a gap between its parts.
           */}
          <Tabs
            value={shownSection}
            onValueChange={(value) => onSectionChange(value as SectionId)}
            className="flex min-w-0 flex-1 flex-col gap-0"
          >
            {/**
             * Stacked, not a row: `DialogContent`'s close button sits absolute
             * in the top-right corner, so the mobile switcher goes under the
             * title instead of beside it.
             */}
            <div className="flex flex-col gap-3 border-b border-border p-6">
              <div className="flex flex-col gap-1.5">
                <DialogTitle>{activeSection.label}</DialogTitle>
                {/**
                 * `Popup` needs exactly one description for assistive tech;
                 * the mobile switcher below stands in for the visible nav, so
                 * this stays sr-only rather than duplicating the section name
                 * on screen.
                 */}
                <DialogDescription className="sr-only">
                  {activeSection.label} settings.
                </DialogDescription>
              </div>

              {/**
               * The scrolling is this wrapper's job, not the tab strip's.
               * `TabsList` is `inline-flex w-fit` with a fixed height and no
               * overflow handling of its own, and `ScrollArea` bakes in a
               * single VERTICAL scrollbar with no way to swap it — so neither
               * primitive can carry a horizontal strip. A plain
               * `overflow-x-auto` box can, and on a touch screen the scrollbar
               * is an overlay that fades out anyway, so it is hidden here
               * rather than left sitting under four tabs.
               *
               * The negative margin plus matching padding let the strip bleed
               * to both edges of the dialog as it scrolls, instead of ending
               * in a hard cut 24px short of them.
               */}
              <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                <TabsList className="w-max">
                  {SECTIONS.map((entry) => (
                    <TabsTrigger
                      key={entry.id}
                      value={entry.id}
                      /**
                       * `flex-none` beats the trigger's default `flex-1`,
                       * which would divide the row between four tabs and
                       * squeeze their labels rather than letting the strip
                       * grow past the screen and scroll.
                       */
                      className="flex-none px-3"
                    >
                      <HugeiconsIcon icon={entry.icon} strokeWidth={2} />
                      {entry.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <TabsContent
              value={shownSection}
              render={<ScrollArea className="min-h-0 flex-1" />}
            >
              <div className="p-6">
                {shownSection === "general" && (
                  <section className="flex flex-col gap-4">
                    <SettingsHeading
                      title="Theme"
                      description="Main color of the interface"
                    />
                    <ThemePicker />
                  </section>
                )}

                {shownSection === "account" && <ProfileSection />}

                {shownSection === "security" && <SecuritySection />}

                {shownSection === "billing" && (
                  <div className="flex flex-col gap-8">
                    <SettingsGroup
                      title="Plan"
                      description="What your account is on today"
                    >
                      <SettingsRow>
                        <ItemContent>
                          <ItemTitle>Current plan</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          {billing.plan === "none" ? (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <Badge
                              variant={
                                billing.plan === "free"
                                  ? "secondary"
                                  : "default"
                              }
                            >
                              {planLabel(billing.plan)}
                            </Badge>
                          )}
                        </ItemActions>
                      </SettingsRow>
                      <SettingsRow>
                        <ItemContent>
                          <ItemTitle>Credits</ItemTitle>
                          <ItemDescription>
                            What is left of this period's allowance.
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-sm text-muted-foreground">
                            {billing.balance === null ? "—" : billing.balance}
                          </span>
                        </ItemActions>
                      </SettingsRow>
                      <SettingsRow>
                        <ItemContent>
                          <ItemTitle>Manage plan</ItemTitle>
                          <ItemDescription>
                            Change your plan or buy more credits.
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link href="/pricing" />}
                          >
                            Manage plan
                          </Button>
                        </ItemActions>
                      </SettingsRow>
                    </SettingsGroup>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
