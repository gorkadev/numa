import assert from "node:assert/strict"
import test from "node:test"

import {
  combineGames,
  moveGameToTop,
  gamesPage,
  parseGamesCursor,
  parseGamesSort,
  reviveGamesPage,
} from "./game-list"

const id = (n: number) => `${n}0000000-0000-4000-8000-000000000000`
const game = (n: number, pinned = false) => ({
  id: id(n),
  title: `Game ${n}`,
  pinnedAt: pinned ? new Date("2026-11-01T00:00:00Z") : null,
  lastTurnFinishedAt: null,
  lastReadAt: null,
})

test("a page keeps the limit and names the last kept game as the next cursor", () => {
  const rows = [game(1), game(2), game(3)]

  const full = gamesPage(rows, 2)
  assert.deepEqual(
    full.items.map((item) => item.id),
    [id(1), id(2)]
  )
  assert.equal(full.next, id(2))

  const last = gamesPage(rows.slice(0, 2), 2)
  assert.equal(last.items.length, 2)
  assert.equal(last.next, null)
})

test("no cursor is the first page, and a cursor that is not a game id is refused", () => {
  assert.equal(parseGamesCursor(null), undefined)
  assert.equal(parseGamesCursor(""), undefined)
  assert.equal(parseGamesCursor(id(4)), id(4))
  assert.equal(parseGamesCursor("garbage"), null)
})

test("a page read over JSON gets its dates back as dates", () => {
  const page = reviveGamesPage({
    items: [
      {
        id: id(1),
        title: "Game 1",
        pinnedAt: null,
        lastTurnFinishedAt: "2026-11-04T10:00:00.000Z",
        lastReadAt: null,
      },
    ],
    next: null,
  })

  assert.deepEqual(
    page.items[0]!.lastTurnFinishedAt,
    new Date("2026-11-04T10:00:00.000Z")
  )
  assert.equal(page.items[0]!.pinnedAt, null)
})

test("pinned games come first, then recents in page order, each game once", () => {
  const pinned = [game(9, true)]
  const pages = [
    { items: [game(1), game(2)], next: id(2) },
    /** A game pinned since this page loaded still shows in it until it refetches. */
    { items: [game(9), game(3)], next: null },
  ]

  assert.deepEqual(
    combineGames(pinned, pages).map((item) => item.id),
    [id(9), id(1), id(2), id(3)]
  )
  assert.deepEqual(combineGames([], []), [])
})

test("the sort defaults to activity and accepts only the two known orders", () => {
  assert.equal(parseGamesSort(undefined), "activity")
  assert.equal(parseGamesSort("garbage"), "activity")
  assert.equal(parseGamesSort("activity"), "activity")
  assert.equal(parseGamesSort("created"), "created")
})

test("a game that just got a message moves to the top of the first page", () => {
  const pages = [
    { items: [game(1), game(2)], next: id(2) },
    { items: [game(3), game(4)], next: null },
  ]

  const bumped = moveGameToTop(pages, id(3))
  assert.deepEqual(
    bumped.map((page) => page.items.map((item) => item.id)),
    [[id(3), id(1), id(2)], [id(4)]]
  )
  assert.equal(bumped[0]?.next, id(2))
})

test("moving a game already on top, or one not loaded, leaves the pages as they are", () => {
  const pages = [{ items: [game(1), game(2)], next: null }]

  assert.equal(moveGameToTop(pages, id(1)), pages)
  assert.equal(moveGameToTop(pages, id(9)), pages)
})
