import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"

/**
 * The three feature rows. The real third row wraps once at both 375 and 1280,
 * which is why the measured features block is 147 tall rather than 130, so it
 * carries a second line.
 */
const FEATURES = [
  { primary: "w-11/12", secondary: null },
  { primary: "w-full", secondary: null },
  { primary: "w-5/6", secondary: "w-4/5" },
]

const FAQ_ROW_WIDTHS = [
  "w-2/5",
  "w-1/2",
  "w-1/3",
  "w-5/12",
  "w-7/12",
  "w-3/5",
  "w-1/4",
]

/**
 * One plan card, sized from the measured Free card.
 *
 * Every box here comes from a primitive the page itself renders: `Card` owns
 * the 24px radius, the 20px `--card-spacing` and the 20px gap between its
 * children; `CardHeader` owns the 6px row gap; `Item size="xs"` owns the
 * padding, border and icon slot of a feature line. Sized content inside them:
 * badge 20, title 24 (`text-base`), two 20px description lines, a 32px button
 * and three 20px feature lines.
 *
 * That lands at 355.75px intrinsic — 20 + 96 header + 20 + 32 button + 20 +
 * 147.75 features + 20 — against a measured Free card of 355.75. The 375.8px
 * measurement was taken on a Max account, where the Pro card carries one extra
 * `CardContent` line (+20 content, +20 gap). A fallback cannot know the plan,
 * so it targets the Free/Pro shape rather than guessing Max (task decision 6).
 */
function PlanCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-28" />
        <CardDescription className="flex flex-col">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-full" />
      </CardContent>
      <CardContent>
        <ItemGroup>
          {FEATURES.map(({ primary, secondary }, featureIndex) => (
            <Item key={featureIndex} size="xs">
              <ItemMedia variant="icon">
                <Skeleton className="size-4 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className={`h-5 ${primary}`} />
                {secondary ? <Skeleton className={`h-5 ${secondary}`} /> : null}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

/**
 * A top-up card, sized from the measured 314.7x168: badge 20 + title 24 + one
 * 20px description line + two 6px gaps = 76 header, then the 32px button,
 * the 20px card gap and the card's 40px of vertical spacing. The eligibility
 * line is left out because it only exists on the free plan, and the card is
 * measured on the paid one.
 */
function TopUpCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-24" />
        <CardDescription className="flex flex-col">
          <Skeleton className="h-5 w-full" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  )
}

/**
 * The FAQ shell, mirroring the accordion's own anatomy without its client
 * component: `Accordion`'s `rounded-2xl border` container, `AccordionItem`'s
 * `not-last:border-b`, and `AccordionTrigger`'s `border border-transparent
 * p-4` row. A row therefore measures 54 (32 padding + 20 line + 2 transparent
 * border), the six separators add 6, and the container border adds 2 — 386 in
 * total, the measured height of the seven-row accordion.
 */
function FaqSkeleton() {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border bg-card">
      {FAQ_ROW_WIDTHS.map((width, index) => (
        <div key={index} className="not-last:border-b">
          <div className="flex flex-1 items-start justify-between gap-6 border border-transparent p-4">
            <div className="flex flex-col">
              <Skeleton className={`h-5 ${width}`} />
            </div>
            <Skeleton className="size-4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Loading() {
  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <MobileSidebarTrigger className="absolute top-2 left-2" />
      <Empty className="flex-none">
        <EmptyHeader className="w-full">
          <EmptyTitle>
            <Skeleton className="h-7 w-52 max-w-full" />
          </EmptyTitle>
          <EmptyDescription className="flex w-full flex-col items-center gap-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5 sm:hidden" />
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div className="grid gap-4 lg:grid-cols-3">
        <PlanCardSkeleton />
        <PlanCardSkeleton />
        <PlanCardSkeleton />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-full max-w-md" />
          <Skeleton className="h-5 w-3/4 max-w-sm sm:hidden" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <TopUpCardSkeleton />
          <TopUpCardSkeleton />
          <TopUpCardSkeleton />
        </div>
      </div>

      <FaqSkeleton />
    </div>
  )
}
