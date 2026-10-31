import { useState } from "react"
import {
  CreditCardIcon,
  FeatherIcon,
  LayoutGridIcon,
  RocketIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Button } from "@workspace/ui/components/button"

type Category = { id: string; label: string }
type Item = { category: string; q: string; a: string }

const ICONS: Record<string, IconSvgElement> = {
  all: LayoutGridIcon,
  start: RocketIcon,
  features: FeatherIcon,
  billing: CreditCardIcon,
}

/**
 * The FAQ list with topic filters, adapted from the efferd faqs-4 block.
 *
 * Hydrated (`client:visible` in `Faq.astro`) because filtering and opening a
 * question run in the browser. Answers stay mounted while closed, so the
 * server rendered markup holds every question and answer for search engines.
 */
export function FaqSection({
  categories,
  items,
}: {
  categories: Category[]
  items: Item[]
}) {
  const [active, setActive] = useState("all")
  const visible = active === "all" ? items : items.filter((item) => item.category === active)

  return (
    <div className="grid gap-8 md:grid-cols-3">
      <div className="flex flex-wrap gap-2 border-b pb-4 md:flex-col md:items-start md:border-b-0 md:pb-0">
        {categories.map((category) => (
          <Button
            key={category.id}
            variant={active === category.id ? "outline" : "ghost"}
            aria-pressed={active === category.id}
            onClick={() => setActive(category.id)}
          >
            {ICONS[category.id] && (
              <HugeiconsIcon icon={ICONS[category.id]!} strokeWidth={2} className="size-4" />
            )}
            {category.label}
          </Button>
        ))}
      </div>

      <Accordion className="gap-2 overflow-visible rounded-none border-0 md:col-span-2">
        {visible.map((item) => (
          <AccordionItem key={item.q} value={item.q} className="overflow-hidden rounded-2xl border-b-0 bg-muted/50">
            <AccordionTrigger className="hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent keepMounted>
              <p className="text-muted-foreground">{item.a}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
