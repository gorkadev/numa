import assert from "node:assert/strict"
import test from "node:test"
import type { ModelMessage, UIMessage } from "ai"

import {
  ATTACHMENT_TURN_BUDGET_BYTES,
  TEXT_ATTACHMENT_MAX_CHARS,
  TEXT_ATTACHMENT_TURN_BUDGET_CHARS,
  keepAttachmentParts,
  resolveAttachments,
} from "./attachments-model"

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

test("a text attachment is cut to its character budget, with a note saying so", async () => {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "file", mediaType: "text/csv", filename: "big.csv", data: { type: "url", url: new URL(`attachment:${a}`) } },
      ],
    },
  ]
  const [message] = await resolveAttachments(messages, "owner", async () => new TextEncoder().encode("x".repeat(TEXT_ATTACHMENT_MAX_CHARS + 10)))
  const [part] = message!.content as Exclude<ModelMessage["content"], string>

  assert.equal(part!.type, "text")
  const text = (part as { text: string }).text
  assert.ok(text.startsWith("Attached file big.csv:\n\n" + "x".repeat(TEXT_ATTACHMENT_MAX_CHARS)))
  assert.ok(text.endsWith(`[Truncated: the file is longer than ${TEXT_ATTACHMENT_MAX_CHARS} characters]`))
})

test("once a turn's attachment budget is spent, older attachments become notes; the newest are kept", async () => {
  const file = (id: string, name: string) => ({
    type: "file" as const,
    mediaType: "image/png",
    filename: name,
    data: { type: "url" as const, url: new URL(`attachment:${id}`) },
  })
  const messages: ModelMessage[] = [
    { role: "user", content: [file(a, "old.png")] },
    { role: "assistant", content: "vale" },
    { role: "user", content: [file(b, "new.png")] },
  ]
  const big = new Uint8Array(ATTACHMENT_TURN_BUDGET_BYTES - 1)
  const resolved = await resolveAttachments(messages, "owner", async () => big)

  const [older] = resolved[0]!.content as Exclude<ModelMessage["content"], string>
  const [newer] = resolved[2]!.content as Exclude<ModelMessage["content"], string>
  assert.equal(newer!.type, "file")
  assert.deepEqual(older, { type: "text", text: "[Attached file old.png left out to save context]" })
})

test("without an owner every attachment becomes a note and nothing is read", async () => {
  let reads = 0
  const messages: ModelMessage[] = [
    { role: "user", content: [{ type: "file", mediaType: "image/png", filename: "a.png", data: { type: "url", url: new URL(`attachment:${a}`) } }] },
  ]
  const [message] = await resolveAttachments(messages, null, async () => {
    reads += 1
    return new Uint8Array(1)
  })

  assert.equal(reads, 0)
  assert.deepEqual(message!.content, [{ type: "text", text: "[Attached file a.png is no longer available]" }])
})

test("kept file parts are rebuilt from their known fields, dropping anything else the client sent", () => {
  const [message] = keepAttachmentParts([
    userMessage([
      {
        type: "file",
        mediaType: "image/png",
        url: `attachment:${a}`,
        filename: "a.png",
        providerMetadata: { google: { x: 1 } },
      },
    ]),
  ])

  assert.deepEqual(message!.parts, [{ type: "file", mediaType: "image/png", url: `attachment:${a}`, filename: "a.png" }])
})

test("text spends its own per-turn character budget, newest first, so text spread over many messages stays bounded", async () => {
  const text = (id: string, name: string): ModelMessage => ({
    role: "user",
    content: [{ type: "file", mediaType: "text/csv", filename: name, data: { type: "url", url: new URL(`attachment:${id}`) } }],
  })
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]
  const messages = ids.map((id, index) => text(id, `t${index}.csv`))
  const resolved = await resolveAttachments(messages, "owner", async () =>
    new TextEncoder().encode("x".repeat(TEXT_ATTACHMENT_MAX_CHARS))
  )

  const kinds = resolved.map((message) => (message.content as Exclude<ModelMessage["content"], string>)[0]!)
  const kept = kinds.filter((part) => part.type === "text" && part.text.startsWith("Attached file")).length
  assert.equal(kept, Math.floor(TEXT_ATTACHMENT_TURN_BUDGET_CHARS / TEXT_ATTACHMENT_MAX_CHARS))
  assert.deepEqual(kinds[0], { type: "text", text: "[Attached file t0.csv left out to save context]" })
  assert.ok((kinds[2] as { text: string }).text.startsWith("Attached file t2.csv"))
})
