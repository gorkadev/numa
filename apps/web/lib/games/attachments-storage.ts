import { AwsClient } from "aws4fetch"

/**
 * The private uploads bucket, over R2's S3 API. It has no public access: every
 * read goes through `/api/attachments/[id]` (the browser) or the chat agent
 * (the model), and both derive the key from the owner, never from the caller.
 *
 * Shared by the Next.js server and the Trigger.dev worker, so it reads its
 * configuration per call rather than at import: a missing variable fails the
 * request that needs it, not every module that happens to import this one.
 */
function bucket() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const name = process.env.R2_UPLOADS_BUCKET

  if (!accountId || !accessKeyId || !secretAccessKey || !name) {
    throw new Error("R2 uploads bucket is not configured")
  }

  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    base: `https://${accountId}.r2.cloudflarestorage.com/${name}`,
  }
}

function objectUrl(base: string, key: string): string {
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`
}

export async function putAttachment(key: string, body: ArrayBuffer, mediaType: string): Promise<void> {
  const { client, base } = bucket()
  /**
   * Signed first and sent with plain `fetch`: `client.fetch` hands the body on
   * as a stream, which goes out chunked under Next.js, and R2 refuses a PUT
   * without a length (411). A buffer body gets its `content-length` set.
   */
  const signed = await client.sign(objectUrl(base, key), {
    method: "PUT",
    headers: { "content-type": mediaType, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
  })
  const response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body })

  if (!response.ok) throw new Error(`R2 upload failed with ${response.status}`)
}

/** The object, or `null` when there is none under `key`. */
export async function getAttachment(key: string): Promise<Response | null> {
  const { client, base } = bucket()
  const response = await client.fetch(objectUrl(base, key))

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`R2 read failed with ${response.status}`)

  return response
}

/**
 * Recently read objects, kept by the worker between turns. The model is sent
 * the whole thread every turn, so without this each turn would download every
 * file the thread ever attached; an object never changes once written, so a
 * kept copy is never stale.
 */
const recent = new Map<string, Uint8Array>()
const RECENT_LIMIT = 32

/** The object's bytes, or `null` when there is none under `key`. */
export async function readAttachmentBytes(key: string): Promise<Uint8Array | null> {
  const kept = recent.get(key)
  if (kept) return kept

  const object = await getAttachment(key)
  if (!object) return null

  const bytes = new Uint8Array(await object.arrayBuffer())
  recent.set(key, bytes)
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value!)

  return bytes
}
