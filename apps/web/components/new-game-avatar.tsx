"use client"

import * as React from "react"
import { Blobatar } from "@blobatar/react"
import { useGaze } from "@blobatar/react/gaze"

const AVATAR_SIZE = 84

/** A stable brand companion; the adjacent heading carries the meaning. */
export function NewGameAvatar() {
  const { ref } = useGaze({ travel: 10, lookAt: "pointer" })

  return (
    <Blobatar
      ref={ref}
      name="alain00"
      palette={{ head: "#2563eb", eye: "#ffffff" }}
      animate="always"
      size={AVATAR_SIZE}
      className="shrink-0"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
      aria-hidden="true"
      focusable={false}
    />
  )
}
