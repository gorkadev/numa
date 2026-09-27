"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "@workspace/ui/components/toast"

type Result = { isFinal: boolean; [index: number]: { transcript: string } }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<Result> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type Session = {
  recognition: Recognition
  phase: "recording" | "finishing" | "settled"
  results: Map<number, string>
  timeout: ReturnType<typeof setTimeout> | null
}

export function useSpeechDictation(value: string, onValueChange: (value: string) => void) {
  const t = useTranslations("GameComposer")
  const [supported, setSupported] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<"idle" | "recording" | "finishing">("idle")
  const [status, setStatus] = useState("")
  const [waveformFailed, setWaveformFailed] = useState(false)
  const mounted = useRef(false)
  const sessionRef = useRef<Session | null>(null)
  const draft = useRef(value)
  const change = useRef(onValueChange)
  const waveformMessage = useRef(t("dictationWaveformUnavailable"))
  useEffect(() => {
    change.current = onValueChange
    waveformMessage.current = t("dictationWaveformUnavailable")
  }, [onValueChange, t])

  useEffect(() => {
    draft.current = value
  }, [value])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const session = sessionRef.current
      sessionRef.current = null
      if (session) {
        session.phase = "settled"
        if (session.timeout) clearTimeout(session.timeout)
        session.recognition.abort()
      }
    }
  }, [])

  const waveformError = useCallback(() => {
    if (!mounted.current) return
    setWaveformFailed(true)
    toast.add({ type: "error", title: waveformMessage.current })
  }, [])

  function settle(session: Session, discard = false) {
    if (sessionRef.current !== session || session.phase === "settled") return
    session.phase = "settled"
    if (session.timeout) clearTimeout(session.timeout)
    sessionRef.current = null
    if (!discard && mounted.current) {
      const text = [...session.results.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, result]) => result.trim())
        .filter(Boolean)
        .join(" ")
      if (text) {
        const current = draft.current
        const next = `${current}${current && !/\s$/.test(current) ? " " : ""}${text}`
        draft.current = next
        change.current(next)
      }
    }
    setPhase("idle")
    setStatus(t("dictationStopped"))
  }

  function stop() {
    const session = sessionRef.current
    if (!session || session.phase !== "recording") return
    session.phase = "finishing"
    setPhase("finishing")
    setStatus(t("dictationFinishing"))
    session.timeout = setTimeout(() => {
      if (sessionRef.current !== session || session.phase === "settled") return
      settle(session)
      try { session.recognition.abort() } catch { /* Already ended. */ }
    }, 5000)
    try { session.recognition.stop() } catch { settle(session) }
  }

  function discard() {
    const session = sessionRef.current
    if (!session) return
    settle(session, true)
    try { session.recognition.abort() } catch { /* Already settled. */ }
  }

  function start() {
    if (sessionRef.current) return
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => Recognition
      webkitSpeechRecognition?: new () => Recognition
    }
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Constructor) {
      setSupported(false)
      setStatus(t("dictationUnavailable"))
      toast.add({ type: "error", title: t("dictationUnavailable") })
      return
    }
    setSupported(true)
    setWaveformFailed(false)
    try {
      const recognition = new Constructor()
      const session: Session = { recognition, phase: "recording", results: new Map(), timeout: null }
      const current = () => mounted.current && sessionRef.current === session && session.phase !== "settled"
      recognition.lang = document.documentElement.lang || "en"
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onstart = () => {
        if (current() && session.phase === "recording") setStatus(t("dictationListening"))
      }
      recognition.onresult = (event) => {
        if (!current()) return
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index]
          if (result?.isFinal) session.results.set(index, result[0]?.transcript ?? "")
        }
      }
      recognition.onerror = (event) => {
        if (!current()) return
        if (event.error === "no-speech" || event.error === "aborted") {
          if (session.phase !== "finishing") settle(session)
          return
        }
        settle(session, !(session.phase === "finishing" && session.results.size > 0))
        const message = event.error === "not-allowed" || event.error === "service-not-allowed"
          ? t("dictationPermissionError")
          : event.error === "audio-capture" ? t("dictationMicrophoneError") : t("dictationError")
        setStatus(message)
        toast.add({ type: "error", title: message })
      }
      recognition.onend = () => { if (current()) settle(session) }
      sessionRef.current = session
      setPhase("recording")
      setStatus(t("dictationStarting"))
      recognition.start()
    } catch {
      const session = sessionRef.current
      if (session) {
        session.phase = "settled"
        if (session.timeout) clearTimeout(session.timeout)
      }
      sessionRef.current = null
      setPhase("idle")
      setStatus(t("dictationError"))
      toast.add({ type: "error", title: t("dictationError") })
    }
  }

  return { phase, status, supported, waveformFailed, waveformError, start, stop, discard, active: phase !== "idle", hasSession: () => Boolean(sessionRef.current), setDraft: (next: string) => { draft.current = next } }
}
