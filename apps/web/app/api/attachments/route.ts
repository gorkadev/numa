import { NextResponse } from "next/server"
import { db } from "@workspace/db"
import { attachments } from "@workspace/db/schema"

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
  const filename = file.name.slice(0, 200)

  try {
    await putAttachment(attachmentKey(session.user.id, id), await file.arrayBuffer(), mediaType)
  } catch (error) {
    console.error("Attachment upload failed", error)
    return new Response(null, { status: 503, headers: privateHeaders })
  }

  /**
   * The library's record of the file. A failure here does not fail the
   * upload: the object is stored and the message can still carry it, it only
   * goes missing from the library.
   */
  await db
    .insert(attachments)
    .values({
      id,
      userId: session.user.id,
      filename,
      mediaType,
      size: file.size,
    })
    .catch((error: unknown) => console.error("Attachment record failed", error))

  return NextResponse.json(
    { url: attachmentUrl(id), mediaType, filename },
    { headers: privateHeaders }
  )
}
