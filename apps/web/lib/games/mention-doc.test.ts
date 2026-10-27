import assert from "node:assert/strict"
import test from "node:test"

import { docToText, mentionedPaths, textToDoc } from "./mention-doc"

const gun = { type: "mention", attrs: { id: "assets/Guns/AK.gltf", label: "AK.gltf" } }

test("a known path after @ becomes a chip labelled with its file name; anything else stays text", () => {
  const doc = textToDoc("Usa @assets/Guns/AK.gltf y me@mail @nope", new Set(["assets/Guns/AK.gltf"]))

  assert.deepEqual(doc, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Usa " },
          gun,
          { type: "text", text: " y me@mail @nope" },
        ],
      },
    ],
  })
})

test("each line is a paragraph, and an empty line an empty one", () => {
  assert.deepEqual(textToDoc("a\n\nb", new Set()), {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ],
  })
  assert.deepEqual(textToDoc("", new Set()), { type: "doc", content: [{ type: "paragraph" }] })
})

test("a chip is written back as @ and its full path, lines joined by newlines", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Usa " }, gun, { type: "text", text: " ya" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [gun] },
    ],
  }

  assert.equal(docToText(doc), "Usa @assets/Guns/AK.gltf ya\n\n@assets/Guns/AK.gltf")
})

test("text survives the round trip unchanged, chips included", () => {
  const known = new Set(["assets/Guns/AK.gltf"])
  for (const text of ["", "hola", "@assets/Guns/AK.gltf", "x\n@assets/Guns/AK.gltf  y\n\n", "a @b c"]) {
    assert.equal(docToText(textToDoc(text, known)), text)
  }
})

test("the paths already chipped in a document are listed once each", () => {
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [gun, { type: "text", text: " " }, gun] }],
  }

  assert.deepEqual([...mentionedPaths(doc)], ["assets/Guns/AK.gltf"])
})
