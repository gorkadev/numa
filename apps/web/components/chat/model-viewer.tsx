"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useTranslations } from "next-intl"

import { Spinner } from "@/components/localized-spinner"
import type { ModelScene } from "./model-scene"

type ModelState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; animations: string[] }

/** The Select value for "no clip": the model's rest pose. */
const REST_POSE = "rest"

/**
 * A glTF model, orbitable with the pointer, with its animation clips one
 * pick away.
 *
 * three.js and the scene are imported only once a model is opened, so the
 * tab itself never pays for the 3D code. An idle clip, when the model has
 * one, plays on open — a character is easier to read moving than in its
 * T-pose.
 */
export function ModelViewer({ src, name }: { src: string; name: string }) {
  const t = useTranslations("ChatFiles")
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ModelScene | null>(null)
  const [state, setState] = useState<ModelState>({ status: "loading" })
  const [clip, setClip] = useState(REST_POSE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const controller = new AbortController()

    import("./model-scene")
      .then(({ mountModelScene }) => mountModelScene(container, src, controller.signal))
      .then((scene) => {
        if (controller.signal.aborted) return scene.dispose()
        sceneRef.current = scene
        const idle = scene.animations.findIndex((animation) => /idle/i.test(animation))
        scene.play(idle === -1 ? null : idle)
        setClip(idle === -1 ? REST_POSE : String(idle))
        setState({ status: "ready", animations: scene.animations })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed" })
      })

    return () => {
      controller.abort()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [src, attempt])

  const clipItems =
    state.status === "ready"
      ? [
          { value: REST_POSE, label: t("restPose") },
          ...state.animations.map((animation, index) => ({ value: String(index), label: animation })),
        ]
      : []

  return (
    <div data-slot="model-viewer" data-src={src} className="relative h-full min-h-0">
      <div ref={containerRef} className="absolute inset-0" />
      {state.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t("loadingFile", { name })}
        </div>
      )}
      {state.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          {t("loadFailed")}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setState({ status: "loading" })
              setAttempt((count) => count + 1)
            }}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      {state.status === "ready" && state.animations.length > 0 && (
        <div className="absolute top-3 left-3">
          <Select
            value={clip}
            onValueChange={(value) => {
              if (value === null) return
              setClip(value)
              sceneRef.current?.play(value === REST_POSE ? null : Number(value))
            }}
            items={clipItems}
          >
            <SelectTrigger size="sm" aria-label={t("animation")} className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {clipItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
