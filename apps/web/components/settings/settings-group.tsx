import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Item, ItemGroup, ItemSeparator } from "@workspace/ui/components/item"

/**
 * One titled block of settings: an optional heading and description, then a
 * single card holding the rows.
 *
 * # Why a card instead of the loose rows this replaced
 *
 * `Item`'s default variant is transparent with a transparent border, so a
 * plain `ItemGroup` renders as rows floating on the dialog's own background,
 * separated only by the gap between them. Nothing then says which rows belong
 * together — and "Appearance" sitting next to "Sign out" with the same
 * visual weight is exactly the failure mode. Drawing one muted surface around
 * a set of rows makes the grouping the first thing read, and the heading
 * above it names the concept the group is about, which a row title cannot do
 * for its neighbours.
 *
 * The heading lives OUTSIDE the card on purpose: a title inside would be
 * another row, and would compete with the rows it is supposed to label.
 */
export function SettingsGroup({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  /** Rendered at the end of the heading row — "Add", "Revoke all", etc. */
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <SettingsHeading
        title={title}
        description={description}
        action={action}
      />
      <SettingsRows>{children}</SettingsRows>
    </section>
  )
}

/**
 * The heading above a block of settings.
 *
 * Exported on its own for the blocks whose body is not a row card — the
 * theme picker is three previews in a grid, and wrapping them in the card
 * would put a frame around a frame — so that those still get the same
 * heading treatment instead of a hand-rolled `h3` per call site.
 */
export function SettingsHeading({
  title,
  description,
  action,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  if (!title && !description && !action) return null

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        {title && (
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        )}
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

/**
 * The card itself: rows stacked flush against each other, hairline-separated.
 *
 * `gap-0` and the `rounded-none` on each row are what turn `ItemGroup`'s
 * spaced-out stack into one surface — the rounding is moved to this wrapper
 * with `overflow-hidden` so only the first and last rows are clipped round,
 * the way a table's first and last cells are.
 *
 * Separators are inserted here rather than written out at every call site:
 * "between each pair of rows, and nowhere else" is a rule about the list, and
 * a caller spelling it out by hand gets it wrong the first time a row becomes
 * conditional and an `ItemSeparator` is left dangling at the end.
 */
export function SettingsRows({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const rows = React.Children.toArray(children).filter(Boolean)

  return (
    <ItemGroup
      className={cn(
        "gap-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/40",
        className
      )}
    >
      {rows.map((row, index) => (
        <React.Fragment key={index}>
          {index > 0 && <ItemSeparator className="my-0 bg-border/60" />}
          {row}
        </React.Fragment>
      ))}
    </ItemGroup>
  )
}

/**
 * A row inside a settings card.
 *
 * A thin pass-through over `Item` that drops the per-row rounding and border
 * so the rows read as one surface — see `SettingsRows`. Everything else about
 * `Item` (its `ItemContent`, `ItemTitle`, `ItemActions` parts) is unchanged,
 * so a row is written exactly as it was before.
 */
export function SettingsRow({
  className,
  ...props
}: React.ComponentProps<typeof Item>) {
  return (
    <Item
      {...props}
      className={cn("rounded-none border-0 bg-transparent", className)}
    />
  )
}
