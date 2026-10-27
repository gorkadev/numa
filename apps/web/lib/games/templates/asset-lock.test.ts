import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import { fetchLockedAssets, parseAssetLock, type AssetLock } from "./asset-lock"

const sha256 = (contents: Buffer) => createHash("sha256").update(contents).digest("hex")

function lockFor(files: Record<string, Buffer>): AssetLock {
  return {
    version: 1,
    files: Object.fromEntries(
      Object.entries(files).map(([path, contents]) => [path, { sha256: sha256(contents), size: contents.length }])
    ),
  }
}

function fakeFetch(blobs: Record<string, Buffer>, requested: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    const contents = blobs[url.slice(url.lastIndexOf("/") + 1)]
    return contents ? new Response(new Uint8Array(contents)) :new Response("missing", { status: 404 })
  }) as typeof fetch
}

test("parseAssetLock rejects paths that escape the seed", () => {
  const bad = { version: 1, files: { "../secret": { sha256: "a".repeat(64), size: 1 } } }
  assert.throws(() => parseAssetLock(Buffer.from(JSON.stringify(bad))), /Invalid template asset lock/)
})

test("fetchLockedAssets downloads each blob by hash and returns a seed with its folders", async () => {
  const gltf = Buffer.from('{"asset":{}}')
  const bin = Buffer.from([1, 2, 3])
  const lock = lockFor({ "assets/kit/Models/A.gltf": gltf, "assets/kit/A.bin": bin })
  const requested: string[] = []

  const seed = await fetchLockedAssets(lock, {
    baseUrl: "https://cdn.example/",
    fetch: fakeFetch({ [sha256(gltf)]: gltf, [sha256(bin)]: bin }, requested),
  })

  assert.deepEqual(seed.folders, ["assets", "assets/kit", "assets/kit/Models"])
  assert.deepEqual(
    seed.files.map((file) => [file.relativePath, file.contents.toString("hex")]),
    [
      ["assets/kit/A.bin", bin.toString("hex")],
      ["assets/kit/Models/A.gltf", gltf.toString("hex")],
    ]
  )
  assert.deepEqual(requested.sort(), [sha256(bin), sha256(gltf)].map((hash) => `https://cdn.example/blobs/${hash}`).sort())
})

test("fetchLockedAssets fails loudly when a blob does not match its lock entry", async () => {
  const real = Buffer.from("real")
  const lock = lockFor({ "assets/kit/A.gltf": real })

  await assert.rejects(
    fetchLockedAssets(lock, { baseUrl: "https://cdn.example", fetch: fakeFetch({ [sha256(real)]: Buffer.from("fake") }) }),
    /Template asset assets\/kit\/A.gltf does not match its lock/
  )
})

test("fetchLockedAssets fails loudly when a blob is missing", async () => {
  const lock = lockFor({ "assets/kit/A.gltf": Buffer.from("real") })

  await assert.rejects(
    fetchLockedAssets(lock, { baseUrl: "https://cdn.example", fetch: fakeFetch({}) }),
    /Template asset assets\/kit\/A.gltf could not be downloaded: HTTP 404/
  )
})

test("fetchLockedAssets stops the remaining downloads once one fails", async () => {
  const files = { "assets/a": Buffer.from("a"), "assets/b": Buffer.from("b"), "assets/c": Buffer.from("c") }
  const lock = lockFor(files)
  const requested: string[] = []
  let slowSignal: AbortSignal | undefined

  const failing = (async (input: string | URL | Request, init?: RequestInit) => {
    const hash = String(input).slice(String(input).lastIndexOf("/") + 1)
    requested.push(hash)
    if (hash === sha256(files["assets/a"])) return new Response("missing", { status: 404 })
    slowSignal = init?.signal ?? undefined
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(new Uint8Array(files["assets/b"]))
  }) as typeof fetch

  await assert.rejects(
    fetchLockedAssets(lock, { baseUrl: "https://cdn.example", fetch: failing, concurrency: 2 }),
    /assets\/a could not be downloaded: HTTP 404/
  )
  await new Promise((resolve) => setTimeout(resolve, 40))

  assert.equal(slowSignal?.aborted, true)
  assert.ok(!requested.includes(sha256(files["assets/c"])), "no new download starts after a failure")
})
