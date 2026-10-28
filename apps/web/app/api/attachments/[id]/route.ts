import { attachmentKey, isAttachmentId } from "@/lib/games/attachments"
import { getAttachment } from "@/lib/games/attachments-storage"
import { getSession } from "@/lib/session"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * One of the caller's attachments, for the thumbnails in the thread.
 *
 * The key is built from the session's user, so another user's id reads as
 * missing. An object never changes once written, so the browser may keep it,
 * privately, for as long as it likes. The bytes are user content served from
 * our origin: they are never sniffed into another type and run in a sandbox
 * with no script, whatever they turn out to hold.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const session = await getSession()

  if (!session || !isAttachmentId(id)) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  const object = await getAttachment(attachmentKey(session.user.id, id)).catch(() => undefined)

  if (object === undefined) {
    return new Response(null, { status: 503, headers: privateHeaders })
  }
  if (!object) {
    return new Response(null, { status: 404, headers: privateHeaders })
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
