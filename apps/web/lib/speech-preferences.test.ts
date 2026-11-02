import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_SPEECH_PREFERENCES,
  listSpeechVoices,
  pickSpeechVoice,
  readSpeechPreferences,
  saveSpeechPreferences,
  type SpeechPreferences,
} from "./speech-preferences"

type Voice = Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI" | "default" | "localService">

function voice(name: string, lang: string, extra: Partial<Voice> = {}): Voice {
  return { name, lang, voiceURI: name, default: false, localService: true, ...extra }
}

function memoryStorage(initial?: string) {
  const values = new Map(initial === undefined ? [] : [["numa:speech", initial]])

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    stored: () => values.get("numa:speech"),
  }
}

const preferences = (voices: Record<string, string>): SpeechPreferences => ({ voices, rate: 1 })

test("lists the language's voices without the novelty ones, in English or Spanish names", () => {
  const voices = [
    voice("Samantha", "en-US"),
    voice("Daniel", "en-GB"),
    voice("Bells", "en-US"),
    voice("Campanas", "en-US"),
    voice("Mónica", "es-ES"),
  ]

  assert.deepEqual(
    listSpeechVoices(voices, "en").map(({ name }) => name),
    ["Daniel", "Samantha"]
  )
  assert.deepEqual(
    listSpeechVoices(voices, "es-ES").map(({ name }) => name),
    ["Mónica"]
  )
})

test("uses the voice saved for that language, not one saved for another", () => {
  const voices = [voice("Samantha", "en-US"), voice("Daniel", "en-GB"), voice("Mónica", "es-ES")]
  const saved = preferences({ en: "Daniel", es: "Mónica" })

  assert.equal(pickSpeechVoice(voices, "en", saved)?.name, "Daniel")
  assert.equal(pickSpeechVoice(voices, "es", saved)?.name, "Mónica")
})

test("a saved voice missing on this device falls back to an automatic one", () => {
  const voices = [voice("Samantha", "en-US")]

  assert.equal(pickSpeechVoice(voices, "en", preferences({ en: "Gone" }))?.name, "Samantha")
})

test("automatic matches the language before the system default", () => {
  const voices = [
    voice("Mónica", "es-ES", { default: true }),
    voice("Google US English", "en-US", { localService: false }),
    voice("Samantha", "en-US"),
  ]

  assert.equal(pickSpeechVoice(voices, "en", preferences({}))?.name, "Samantha")
})

test("automatic takes the system default when it speaks the language", () => {
  const voices = [voice("Paulina", "es-MX"), voice("Mónica", "es-ES", { default: true })]

  assert.equal(pickSpeechVoice(voices, "es", preferences({}))?.name, "Mónica")
})

test("no voice for the language picks nothing, leaving it to the browser", () => {
  assert.equal(pickSpeechVoice([voice("Mónica", "es-ES")], "fr", preferences({})), undefined)
})

test("preferences survive a save and a read", () => {
  const storage = memoryStorage()
  const saved = { voices: { en: "Samantha" }, rate: 1.25 }

  saveSpeechPreferences(saved, storage)
  assert.deepEqual(readSpeechPreferences(storage), saved)
})

test("missing, corrupt or out-of-range preferences read as the defaults", () => {
  for (const stored of [undefined, "{", "null", '{"voices":3,"rate":99}']) {
    assert.deepEqual(readSpeechPreferences(memoryStorage(stored)), DEFAULT_SPEECH_PREFERENCES)
  }
})

test("storage that throws reads as the defaults and ignores a save", () => {
  const blocked = {
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
  }

  assert.deepEqual(readSpeechPreferences(blocked), DEFAULT_SPEECH_PREFERENCES)
  assert.doesNotThrow(() => saveSpeechPreferences(DEFAULT_SPEECH_PREFERENCES, blocked))
})
