import { NextResponse } from "next/server"

import {
  attachmentKey,
  attachmentMediaType,
  attachmentProblem,
  attachmentUrl,
} from "@/lib/games/attachments"
import { putAttachment } from "@/lib/games/attachments-storage"
import { getSession } from "@/lib/session"

const privateHeaders = { "cache-control": "no-store, private" }

/**
 * Stores one file the composer attached, before the message that carries it is
 * sent — and before the game exists, on the home screen. That is why the key
 * hangs off the user rather than a game.
 *
 * The bytes pass through here instead of going straight to R2 with a signed
 * URL, so the type and size are checked on bytes we actually received and the
 * bucket needs no CORS rules.
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (!session) {
    return new Response(null, { status: 401, headers: privateHeaders })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file" }, { status: 400, headers: privateHeaders })
  }

  const problem = attachmentProblem(file)
  const mediaType = attachmentMediaType(file)

  if (problem || !mediaType) {
    return NextResponse.json({ error: problem ?? "type" }, { status: 400, headers: privateHeaders })
  }

  const id = crypto.randomUUID()

  try {
    await putAttachment(attachmentKey(session.user.id, id), await file.arrayBuffer(), mediaType)
  } catch (error) {
    console.error("Attachment upload failed", error)
    return new Response(null, { status: 503, headers: privateHeaders })
  }

  return NextResponse.json(
    { url: attachmentUrl(id), mediaType, filename: file.name.slice(0, 200) },
    { headers: privateHeaders }
  )
}
