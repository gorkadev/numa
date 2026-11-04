"use client"

import { useEffect, useRef, useState } from "react"
import { useFormatter, useTranslations } from "next-intl"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import {
  File01Icon,
  GridViewIcon,
  Image01Icon,
  LeftToRightListBulletIcon,
  LibraryIcon,
  Pdf01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { getJson } from "@/components/chat/use-subagent-run-detail"
import { Spinner } from "@/components/localized-spinner"
import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger"
import {
  libraryKind,
  type LibraryItem,
  type LibraryPage as LibraryPageData,
  type LibraryTab,
} from "@/lib/library"

type View = "grid" | "list"

const TABS = [
  "all",
  "image",
  "document",
] as const satisfies readonly LibraryTab[]

/**
 * How long the search waits after the last keystroke before it asks the
 * server: long enough that typing a word is one request, short enough that
 * the results feel like they follow the typing.
 */
const SEARCH_DELAY_MS = 250

/**
 * How far below the visible area the next page starts loading, so a steady
 * scroll reaches it already rendered instead of waiting at the bottom.
 */
const PREFETCH_MARGIN = "0px 0px 800px 0px"

/**
 * A page loaded with the route is fresh for this long; after it, going back
 * to the library refetches, so files attached elsewhere meanwhile show up.
 */
const STALE_MS = 30_000

/** Owner-scoped read route: another user's id reads as missing. */
const fileSrc = (id: string) => `/api/attachments/${id}`

function pageUrl(tab: LibraryTab, query: string, after: string | null) {
  const params = new URLSearchParams({ tab })
  if (query) params.set("q", query)
  if (after) params.set("after", after)
  return `/api/library?${params}`
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

function FileIcon({
  mediaType,
  className,
}: {
  mediaType: string
  className?: string
}) {
  return (
    <HugeiconsIcon
      icon={
        libraryKind(mediaType) === "image"
          ? Image01Icon
          : mediaType === "application/pdf"
            ? Pdf01Icon
            : File01Icon
      }
      className={className}
    />
  )
}

/**
 * Every file the user attached from the composer, read a page at a time.
 *
 * Both views share one infinite query: the grid and the list are two ways of
 * showing the same rows, so switching keeps every page already loaded and the
 * place in it. The title bar and the toolbar stay put; only the area below
 * them scrolls, and nearing its end loads the next page.
 */
export function LibraryPage({ firstPage }: { firstPage: LibraryPageData }) {
  const t = useTranslations("Library")
  const [tab, setTab] = useState<LibraryTab>("all")
  const [query, setQuery] = useState("")
  const [view, setView] = useState<View>("grid")
  const [loadedAt] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const search = useDebounced(query.trim(), SEARCH_DELAY_MS)
  const unfiltered = tab === "all" && search === ""

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    isPlaceholderData,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["library", tab, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getJson<LibraryPageData>(pageUrl(tab, search, pageParam)),
    getNextPageParam: (last) => last.next,
    /**
     * The server rendered the unfiltered first page with the route; any other
     * tab or search starts from the network.
     */
    initialData: unfiltered
      ? { pages: [firstPage], pageParams: [null] }
      : undefined,
    initialDataUpdatedAt: loadedAt,
    staleTime: STALE_MS,
    /** A new tab or search keeps showing the last results until its own arrive. */
    placeholderData: keepPreviousData,
  })

  const items = data?.pages.flatMap((page) => page.items) ?? []
  const libraryIsEmpty = firstPage.items.length === 0 && unfiltered && !query

  /** A new tab or search is a new list: it starts at its top. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab, search])

  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry?.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isFetchNextPageError &&
          !isPlaceholderData
        ) {
          void fetchNextPage()
        }
      },
      { root, rootMargin: PREFETCH_MARGIN }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isPlaceholderData,
    items.length,
  ])

  const tabLabel = {
    all: t("all"),
    image: t("images"),
    document: t("documents"),
  }

  /** Waiting on a new tab or search, not on the next page of the same one. */
  const searching = isFetching && !isFetchingNextPage && isPlaceholderData

  return (
    <main className="flex h-svh w-full min-w-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4">
        <MobileSidebarTrigger className="-ms-1.5" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("title")}
        </h1>
      </header>

      {libraryIsEmpty ? (
        <Empty className="mt-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={LibraryIcon} />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-5xl shrink-0 flex-wrap items-center gap-3 px-4 pt-2 pb-4 md:px-8">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as LibraryTab)}
            >
              <TabsList>
                {TABS.map((id) => (
                  <TabsTrigger key={id} value={id}>
                    {tabLabel[id]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="ms-auto flex items-center gap-2">
              <InputGroup className="w-full sm:w-64">
                <InputGroupAddon>
                  <HugeiconsIcon icon={Search01Icon} />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("search")}
                  aria-label={t("search")}
                  maxLength={200}
                />
                {searching ? (
                  <InputGroupAddon align="inline-end">
                    <Spinner />
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
              <ToggleGroup
                value={[view]}
                onValueChange={(value) => {
                  const next = value[0] as View | undefined
                  if (next) setView(next)
                }}
              >
                <ToggleGroupItem value="grid" aria-label={t("gridView")}>
                  <HugeiconsIcon icon={GridViewIcon} />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label={t("listView")}>
                  <HugeiconsIcon icon={LeftToRightListBulletIcon} />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="mx-auto w-full max-w-5xl px-4 pb-8 transition-opacity duration-150 data-[searching=true]:opacity-60 md:px-8"
              data-searching={searching}
              aria-busy={isFetching}
            >
              {isError && !isFetchNextPageError && items.length === 0 ? (
                <Empty className="mt-10">
                  <EmptyHeader>
                    <EmptyTitle>{t("loadErrorTitle")}</EmptyTitle>
                    <EmptyDescription>
                      {t("loadErrorDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" onClick={() => void refetch()}>
                      {t("retry")}
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : !data ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : items.length === 0 ? (
                <Empty className="mt-10">
                  <EmptyHeader>
                    <EmptyTitle>{t("noMatchesTitle")}</EmptyTitle>
                    <EmptyDescription>
                      {t("noMatchesDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : view === "grid" ? (
                <LibraryGrid items={items} />
              ) : (
                <LibraryList items={items} />
              )}

              <div ref={sentinelRef} aria-hidden />

              {isFetchingNextPage ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : isFetchNextPageError ? (
                <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                  <span>{t("loadMoreError")}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchNextPage()}
                  >
                    {t("retry")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </main>
  )
}

function LibraryGrid({ items }: { items: LibraryItem[] }) {
  const t = useTranslations("Library")

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={fileSrc(item.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("open", { filename: item.filename })}
            className="group block rounded-[min(var(--radius-4xl),24px)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {/**
             * Hover lifts the card 2px and a press settles it back, on
             * transitions so a pointer sweeping the grid retargets instead of
             * restarting. `-translate-y-*` sets the CSS `translate` property,
             * not `transform`, so that is the one the transition names.
             * Nothing inside is scaled: a scaled image or icon is resampled
             * and reads blurred. Hover only fires on fine pointers (Tailwind's
             * `hover:` is gated on `(hover: hover)`), and reduced motion keeps
             * the color and drops the lift.
             */}
            <Card className="gap-2.5 transition-[translate,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] [--card-spacing:--spacing(2.5)] group-hover:-translate-y-0.5 group-hover:bg-muted/50 group-active:translate-y-0 group-active:duration-100 motion-reduce:translate-none">
              <CardHeader>
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-normal">
                  <FileIcon
                    mediaType={item.mediaType}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{item.filename}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-[calc(min(var(--radius-4xl),24px)-var(--card-spacing))] bg-muted/60">
                  {libraryKind(item.mediaType) === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-scoped route, not an optimizable asset
                    <img
                      src={fileSrc(item.id)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : (
                    <FileIcon
                      mediaType={item.mediaType}
                      className="size-10 text-muted-foreground/70 transition-colors duration-200 group-hover:text-muted-foreground"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </a>
        </li>
      ))}
    </ul>
  )
}

function LibraryList({ items }: { items: LibraryItem[] }) {
  const t = useTranslations("Library")
  const format = useFormatter()

  const size = (bytes: number) =>
    bytes < 1024
      ? format.number(bytes, {
          style: "unit",
          unit: "byte",
          unitDisplay: "narrow",
        })
      : bytes < 1024 * 1024
        ? format.number(bytes / 1024, {
            style: "unit",
            unit: "kilobyte",
            maximumFractionDigits: 0,
          })
        : format.number(bytes / 1024 / 1024, {
            style: "unit",
            unit: "megabyte",
            maximumFractionDigits: 1,
          })

  return (
    /**
     * The column headings stick to the top of the scrolling area. The table's
     * own container scrolls sideways by default, which would make IT the box
     * the headings stick to; the fixed layout already truncates every cell, so
     * that overflow is released here and the headings stick to the page's
     * scroll instead. Their divider is a shadow, because a border on the row
     * would stay behind when the cells stick.
     */
    <div className="[&_[data-slot=table-container]]:overflow-visible">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-background [&>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
            <TableHead className="font-normal text-muted-foreground">
              {t("name")}
            </TableHead>
            <TableHead className="hidden w-28 text-end font-normal text-muted-foreground sm:table-cell">
              {t("size")}
            </TableHead>
            <TableHead className="w-32 text-end font-normal text-muted-foreground">
              {t("added")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            /**
             * A row's hover is painted on its cells, rounded at the row's two
             * ends with the radius of the sidebar's items: a `<tr>` cannot
             * take a radius itself. With rounded hovers the dividers between
             * rows would cut the corners square, so the body rows go without.
             */
            <TableRow
              key={item.id}
              className="border-0 hover:bg-transparent [&:hover>td]:bg-muted/50 [&>td]:transition-colors [&>td:first-child]:rounded-s-xl [&>td:last-child]:rounded-e-xl"
            >
              <TableCell>
                <a
                  href={fileSrc(item.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {libraryKind(item.mediaType) === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-scoped route, not an optimizable asset
                    <img
                      src={fileSrc(item.id)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-6 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
                      <FileIcon
                        mediaType={item.mediaType}
                        className="size-4 text-muted-foreground"
                      />
                    </span>
                  )}
                  <span className="truncate">{item.filename}</span>
                </a>
              </TableCell>
              <TableCell className="hidden text-end text-muted-foreground tabular-nums sm:table-cell">
                {size(item.size)}
              </TableCell>
              <TableCell className="text-end text-muted-foreground">
                {format.dateTime(new Date(item.createdAt), {
                  dateStyle: "medium",
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
