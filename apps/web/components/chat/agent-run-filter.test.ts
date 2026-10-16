import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { filterAgentRuns } from "./agent-run-filter.ts"

const statuses = ["running", "done", "partial", "blocked", "error", "aborted", "skipped", "unavailable"] as const
const records = statuses.map((status, index) => ({ agentId: String(index), status }))

test("All preserves every status and record identity in dispatch order", () => {
  const result = filterAgentRuns(records, "all")
  assert.deepEqual(result, records)
  result.forEach((record, index) => assert.equal(record, records[index]))
})

test("Active is running only; Finished includes every non-running outcome in order", () => {
  assert.deepEqual(filterAgentRuns(records, "active"), records.slice(0, 1))
  assert.deepEqual(filterAgentRuns(records, "finished"), records.slice(1))
  assert.deepEqual(records.map((record) => record.status), statuses)
})

test("empty inputs and no matching records stay empty", () => {
  for (const filter of ["all", "active", "finished"] as const) {
    assert.deepEqual(filterAgentRuns([], filter), [])
  }
  assert.deepEqual(filterAgentRuns(records.slice(1), "active"), [])
  assert.deepEqual(filterAgentRuns(records.slice(0, 1), "finished"), [])
})

test("live status transitions move records without changing source ordering", () => {
  const updated = records.map((record) => record.status === "running" ? { ...record, status: "done" as const } : record)
  assert.deepEqual(filterAgentRuns(updated, "active"), [])
  assert.deepEqual(filterAgentRuns(updated, "finished"), updated)
})

test("filter labels and contextual empty states are translated in both locales", () => {
  const filters = ["en", "es"].map((locale) => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")).ChatAgents.filters)
  for (const translations of filters) {
    assert.deepEqual(Object.keys(translations).sort(), ["label", "all", "active", "finished", "emptyActive", "emptyFinished"].sort())
    for (const value of Object.values(translations)) assert.ok(typeof value === "string" && value.length > 0)
  }
})
