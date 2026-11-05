import assert from "node:assert/strict"
import test from "node:test"

import { normalizeUsername, usernameIssue, usernameIssueFromCode } from "./username"

test("a username is trimmed, loses a leading @ and is lowercased, as the plugin stores it", () => {
  assert.equal(normalizeUsername("  @Gorka_Dev "), "gorka_dev")
})

test("a username follows the plugin's length and character rules", () => {
  assert.equal(usernameIssue("ab"), "tooShort")
  assert.equal(usernameIssue("a".repeat(31)), "tooLong")
  assert.equal(usernameIssue("gorka dev"), "invalid")
  assert.equal(usernameIssue("gorka-dev"), "invalid")
  assert.equal(usernameIssue("gorka.dev_1"), null)
  assert.equal(usernameIssue("a".repeat(30)), null)
})

test("the server's error codes map to the same issues, and a taken name to its own", () => {
  assert.equal(usernameIssueFromCode("USERNAME_IS_ALREADY_TAKEN"), "taken")
  assert.equal(usernameIssueFromCode("USERNAME_TOO_SHORT"), "tooShort")
  assert.equal(usernameIssueFromCode("USERNAME_TOO_LONG"), "tooLong")
  assert.equal(usernameIssueFromCode("INVALID_USERNAME"), "invalid")
  assert.equal(usernameIssueFromCode("SOMETHING_ELSE"), null)
  assert.equal(usernameIssueFromCode(undefined), null)
})
