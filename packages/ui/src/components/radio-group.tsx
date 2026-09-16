"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-2xl border border-transparent bg-input/90 outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground dark:size-2.5" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

/**
 * A radio rendered as a selectable card rather than a dot: the option's own
 * content IS the control, with the selection shown as a ring around it and a
 * check badge in the corner.
 *
 * The pattern belongs here rather than in a feature folder because nothing
 * about it is specific to what is being picked — a theme preview, a layout,
 * a plan — and it is the same accessibility contract as `RadioGroupItem`
 * (Base UI's `Radio.Root` renders a real `input[type=radio]` under the hood,
 * so keyboard navigation, form participation and a wrapping `<label>` all
 * behave natively).
 *
 * `aspect-[4/3]` and the surface colors are left to the caller: a card's
 * shape is a property of what it is previewing, not of "being selectable".
 */
function RadioGroupCard({
  className,
  children,
  ...props
}: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-card"
      className={cn(
        "relative block w-full overflow-hidden rounded-xl border-2 border-border p-0 text-left transition-colors outline-none not-data-checked:hover:border-ring/50 focus-visible:ring-3 focus-visible:ring-ring/30 data-checked:border-primary",
        className
      )}
      {...props}
    >
      {children}
      <RadioPrimitive.Indicator
        data-slot="radio-group-card-indicator"
        className="absolute right-2 bottom-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={3} />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem, RadioGroupCard }
