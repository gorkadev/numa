import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { matchCommands } from "./slash-commands"

const commands = [
  { name: "compact", description: "Summarize" },
  { name: "clear", description: "Clear" },
]

describe("matchCommands", () => {
  it("lists every command for a bare slash", () => {
    assert.deepEqual(
      matchCommands(commands, "").map(({ name }) => name),
      ["compact", "clear"]
    )
  })

  it("keeps the commands whose name starts with the query, ignoring case", () => {
    assert.deepEqual(matchCommands(commands, "com").map(({ name }) => name), ["compact"])
    assert.deepEqual(matchCommands(commands, "CL").map(({ name }) => name), ["clear"])
  })

  it("lists nothing when no name matches", () => {
    assert.deepEqual(matchCommands(commands, "x"), [])
  })
})
