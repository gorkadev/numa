import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

/**
 * The FAQ list, on the app's `Accordion` primitive.
 *
 * Unlike the site's other shared components this one is hydrated
 * (`client:visible` in `Faq.astro`): opening and closing a question is Base
 * UI's behaviour, so React has to run in the browser for it. It only loads
 * once the FAQ scrolls into view, and the server rendered markup already
 * holds every question and answer for search engines and for readers before
 * then.
 */
export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion>
      {items.map((item) => (
        <AccordionItem key={item.q} value={item.q}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent keepMounted>
            <p className="text-muted-foreground">{item.a}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
