import assert from "node:assert/strict"
import test from "node:test"

import {
  combineGames,
  gamesPage,
  parseGamesCursor,
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
