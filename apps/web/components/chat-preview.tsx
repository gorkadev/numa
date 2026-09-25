"use client"

import { useEffect, useRef, useState } from "react"

import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { Spinner } from "@/components/localized-spinner"

import { PREVIEW_SANDBOX_FLAGS } from "@/lib/games/preview-sandbox"

/**
 * The running game, embedded from this origin.
 *
 * This used to be a full card with its own header — title, reload, close —
 * because it was one of two mutually exclusive docked panes in
 * `game-chat.tsx`. 10c folded both panes into one `SidePanel` (see that
 * file) with a shared tab header, so the card, the title and both buttons
 * moved there; what is left here is only the part `SidePanel` cannot own
 * itself — the iframe and its loading state — rendered as a plain body that
 * drops into whichever container `SidePanel` gives it.
 *
 * The iframe points at the app's own proxy rather than at the sandbox's preview
 * URL, so the sandbox's own token stays on the server.
 *
 * Authorization travels in the path because the frame cannot send a cookie: it
 * is sandboxed onto an opaque origin, and a module script fetched from a null
 * origin carries no credentials, so `./game.js` would reach the proxy anonymous.
 * A signed token in a path segment survives that — relative resolution keeps the
 * directory prefix, so every file the game asks for stays authorized without the
 * game knowing the token exists. A query string would not: resolution drops it.
 *
 * The entry point is spelled out as `index.html` rather than left as a bare
 * directory: Next normalizes `trailingSlash: false`, so a `/preview/` src is
 * 308-redirected to `/preview`, and the frame's base URL loses its last segment.
 * A relative `./game.js` would then resolve to `/api/games/<id>/game.js` — off
 * the proxy entirely, and a 404. Naming the file keeps the directory in the base
 * without asking Next for a redirect.
 */
export type PreviewPhase = "starting" | "slow" | "ready" | "timeout" | "failed"

const SLOW_AFTER_MS = 5_000
const TIMEOUT_AFTER_MS = 30_000
const READY_MESSAGE_TYPE = "numa-preview-ready"

export function ChatPreviewBody({
  gameId,
  previewToken,
  revision,
  reloadKey,
  onPhaseChange,
  onRetry,
  hidden,
  disablePointerEvents,
  allowFullScreen,
  className,
  ...props
}: {
  gameId: string
  previewToken: string
  /**
   * The last revision the agent reported, which changes only on a turn that
   * wrote to the sandbox. Every distinct value the frame is handed remounts it
   * exactly once, so a repeated one — what a reconnecting tab can see — leaves
   * a running game alone.
   */
  revision: number
  /**
   * Bumped by `SidePanel`'s reload button, which now owns the counter this
   * component used to keep for itself (`reloads` in the pre-10c version) —
   * the button lives in the shared tab header, not in here, so the count it
   * drives has to live wherever the button does.
   */
  reloadKey: number
  onPhaseChange?: (phase: PreviewPhase) => void
  onRetry?: () => void
  /**
   * Set by `SidePanel` while the Agents tab is active, so the frame — and
   * the running game inside it — stays mounted across a tab switch instead
   * of being torn down and rebuilt (see that file's comment on
   * `previewMounted`). A native `hidden` attribute rather than an unmount:
   * `display: none` costs the frame nothing, while removing it from the
   * tree would restart the game exactly the same as closing the panel used
   * to.
   */
  hidden?: boolean
  /**
   * Set by `SidePanel` for the duration of a resize drag. The iframe is a
   * rectangle the browser routes pointer events to directly, so without
   * this a drag that passes over the preview loses every subsequent
   * `pointermove` to the iframe's own document instead of the window
   * listener tracking the width.
   */
  disablePointerEvents?: boolean
  /**
   * Grants the frame the Fullscreen API permission it needs to answer its own
   * `requestFullscreen()` calls — without a permissions policy allowing it, a
   * cross-origin-feeling sandboxed frame refuses the call outright rather than
   * expanding. Only `/games/[id]/play` passes this: the docked preview in
   * `SidePanel` has its own toolbar and never asks the frame itself to go
   * fullscreen, so leaving every other embed unchanged is the safer default.
   * Both attributes are set together because browser support for the
   * permissions-policy `allow` syntax and the legacy boolean attribute still
   * varies.
   */
  allowFullScreen?: boolean
} & Omit<React.ComponentPropsWithoutRef<"div">, "hidden" | "children">) {
  /**
   * Remounting is the reload. `src` is identical across updates — the sandbox
   * keeps one preview URL for its whole life — so assigning it again would be a
   * no-op, and reaching into `contentWindow.location` is not available to a
   * frame deliberately kept out of this origin.
   */
  const t = useTranslations("GamePreview")
  const frameKey = `${revision}:${reloadKey}`

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const activeAttemptRef = useRef<string | null>(null)
  const failAttemptRef = useRef<(attemptId: string) => void>(() => {})
  const [phaseState, setPhaseState] = useState<{
    key: string
    phase: PreviewPhase
  }>({ key: frameKey, phase: "starting" })
  const [attempt, setAttempt] = useState<{ key: string; id: string } | null>(
    null
  )
  const phase =
    phaseState.key === frameKey ? phaseState.phase : ("starting" as const)

  useEffect(() => onPhaseChange?.(phase), [onPhaseChange, phase])

  useEffect(() => {
    const controller = new AbortController()
    const attemptId = crypto.randomUUID()
    let settled = false
    const slowTimer = setTimeout(() => {
      if (!settled) {
        setPhaseState({ key: frameKey, phase: "slow" })
      }
    }, SLOW_AFTER_MS)
    const timeoutTimer = setTimeout(() => finish("timeout"), TIMEOUT_AFTER_MS)

    function clearTimers() {
      clearTimeout(slowTimer)
      clearTimeout(timeoutTimer)
    }

    function finish(nextPhase: PreviewPhase) {
      if (settled) return
      settled = true
      clearTimers()
      activeAttemptRef.current = null
      setPhaseState({ key: frameKey, phase: nextPhase })
    }

    function failAttempt(id: string) {
      if (activeAttemptRef.current === id) finish("failed")
    }

    activeAttemptRef.current = attemptId
    failAttemptRef.current = failAttempt

    function onMessage(event: MessageEvent) {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        typeof event.data !== "object" ||
        event.data === null ||
        event.data.type !== READY_MESSAGE_TYPE ||
        event.data.attemptId !== attemptId
      ) {
        return
      }

      finish("ready")
    }

    window.addEventListener("message", onMessage)
    void fetch(
      `/api/games/${gameId}/preview/${previewToken}/index.html?previewAttempt=${encodeURIComponent(attemptId)}`,
      { method: "HEAD", cache: "no-store", signal: controller.signal }
    )
      .then((response) => {
        if (settled) return
        if (!response.ok) {
          finish("failed")
          return
        }
        setAttempt({ key: frameKey, id: attemptId })
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") finish("failed")
      })

    return () => {
      settled = true
      controller.abort()
      clearTimers()
      window.removeEventListener("message", onMessage)
      if (activeAttemptRef.current === attemptId)
        activeAttemptRef.current = null
    }
  }, [frameKey, gameId, previewToken])

  const loading = phase === "starting" || phase === "slow"
  const canRetry = phase === "failed" || phase === "timeout"

  return (
    <div
      className={cn("relative size-full", className)}
      hidden={hidden}
      {...props}
    >
      {loading || canRetry ? (
        <div className="absolute inset-0 z-10 grid place-items-center gap-3 bg-background p-4 text-center">
          {loading ? (
            <>
              <Spinner />
              <p className="text-sm text-muted-foreground">
                {phase === "slow"
                  ? t("slowPreview")
                  : t("startingPreview")}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {phase === "timeout"
                  ? t("timeoutPreview")
                  : t("failedPreview")}
              </p>
              <Button size="sm" onClick={onRetry}>
                {t("retry")}
              </Button>
            </>
          )}
        </div>
      ) : null}

      {attempt?.key === frameKey ? (
        <iframe
          ref={iframeRef}
          className={cn(
            "size-full border-0",
            disablePointerEvents && "pointer-events-none"
          )}
          key={`${frameKey}:${attempt.id}`}
          onError={() => failAttemptRef.current(attempt.id)}
          sandbox={PREVIEW_SANDBOX_FLAGS}
          src={`/api/games/${gameId}/preview/${previewToken}/index.html?previewAttempt=${encodeURIComponent(attempt.id)}`}
          title={t("iframeTitle")}
          allow={allowFullScreen ? "fullscreen" : undefined}
          allowFullScreen={allowFullScreen}
        />
      ) : null}
    </div>
  )
}
