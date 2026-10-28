import assert from "node:assert/strict"
import test from "node:test"
import type { ModelMessage, UIMessage } from "ai"

import { keepAttachmentParts, resolveAttachments } from "./attachments-model"

const a = "3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b"
const b = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a"

function userMessage(parts: UIMessage["parts"]): UIMessage {
  return { id: "m1", role: "user", parts }
}

test("a user message keeps only file parts that reference our attachments", () => {
  const [message] = keepAttachmentParts([
    userMessage([
      { type: "text", text: "mira" },
      { type: "file", mediaType: "image/png", url: `attachment:${a}`, filename: "a.png" },
      { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" },
      { type: "file", mediaType: "image/png", url: "https://internal.example/secret.png" },
      { type: "file", mediaType: "text/html", url: `attachment:${b}` },
    ]),
  ])

  assert.deepEqual(message!.parts, [
    { type: "text", text: "mira" },
    { type: "file", mediaType: "image/png", url: `attachment:${a}`, filename: "a.png" },
  ])
})

test("a user message keeps at most five attachments; assistant messages are left alone", () => {
  const file = (n: number) => ({
    type: "file" as const,
    mediaType: "image/png",
    url: `attachment:${a.slice(0, -1)}${n}`,
  })
  const assistant: UIMessage = { id: "m2", role: "assistant", parts: [{ type: "text", text: "ok" }] }
  const [user, kept] = keepAttachmentParts([userMessage([1, 2, 3, 4, 5, 6].map(file)), assistant])

  assert.equal(user!.parts.length, 5)
  assert.equal(kept, assistant)
})

test("attachments become bytes for images and PDFs, text for text files, and a note when gone", async () => {
  const reads: string[] = []
  const objects: Record<string, string> = {
    [`users/owner/${a}`]: "PNGBYTES",
    [`users/owner/${b}`]: "# notas",
  }
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "mira" },
        { type: "file", mediaType: "image/png", filename: "a.png", data: { type: "url", url: new URL(`attachment:${a}`) } },
        { type: "file", mediaType: "text/markdown", filename: "notas.md", data: { type: "url", url: new URL(`attachment:${b}`) } },
        { type: "file", mediaType: "image/png", filename: "x.png", data: { type: "url", url: new URL("attachment:7e6d5c4b-3a29-4817-a6f5-e4d3c2b1a090") } },
        { type: "file", mediaType: "image/png", filename: "evil.png", data: { type: "url", url: new URL("https://internal.example/a.png") } },
      ],
    },
    { role: "assistant", content: "vale" },
  ]

  const resolved = await resolveAttachments(messages, "owner", async (key) => {
    reads.push(key)
    const text = objects[key]
    return text === undefined ? null : new TextEncoder().encode(text)
  })

  const content = resolved[0]!.content as Exclude<ModelMessage["content"], string>
  assert.deepEqual(content[0], { type: "text", text: "mira" })
  assert.deepEqual(content[1], {
    type: "file",
    mediaType: "image/png",
    filename: "a.png",
    data: { type: "data", data: new TextEncoder().encode("PNGBYTES") },
  })
  assert.deepEqual(content[2], { type: "text", text: "Attached file notas.md:\n\n# notas" })
  assert.deepEqual(content[3], { type: "text", text: "[Attached file x.png is no longer available]" })
  assert.deepEqual(content[4], { type: "text", text: "[Attached file evil.png is no longer available]" })
  assert.equal(resolved[1], messages[1])
  assert.deepEqual(reads.sort(), [`users/owner/${a}`, `users/owner/${b}`, "users/owner/7e6d5c4b-3a29-4817-a6f5-e4d3c2b1a090"].sort())
})
