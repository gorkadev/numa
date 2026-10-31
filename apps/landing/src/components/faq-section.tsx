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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type Category = { id: string; label: string }
type Item = { category: string; q: string; a: string }

const ICONS: Record<string, IconSvgElement> = {
  all: LayoutGridIcon,
  start: RocketIcon,
  features: FeatherIcon,
  billing: CreditCardIcon,
}

/**
 * The FAQ list with topic filters, adapted from the efferd faqs-4 block. The
 * list sits in a Card, as in the shadcn accordion card example, so the
 * accordion drops its own border and dividers; each item is a rounded row
 * that fills in while open.
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

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {ICONS[active] && <HugeiconsIcon icon={ICONS[active]!} strokeWidth={2} className="size-4" />}
            {categories.find((category) => category.id === active)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-1">
          <Accordion className="gap-1 rounded-none border-0">
            {visible.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="rounded-2xl not-last:border-b-0">
                <AccordionTrigger className="hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent keepMounted>
                  <p className="text-muted-foreground">{item.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
