/**
 * Read-aloud preferences. They live in this browser rather than on the account
 * because the voices do: each device has its own, so one chosen here means
 * nothing on another.
 *
 * One voice per language, since a voice reading another language's text sounds
 * wrong. A voice that is missing here falls back to an automatic choice.
 */
export type SpeechPreferences = {
  /** Base language (`en`) to the chosen voice's `voiceURI`. */
  voices: Record<string, string>
  rate: number
}

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2]

export const DEFAULT_SPEECH_PREFERENCES: SpeechPreferences = { voices: {}, rate: 1 }

const STORAGE_KEY = "numa:speech"

/**
 * macOS's sound effects. They are listed as voices of a language, and under the
 * system's language, so both names are needed.
 */
const NOVELTY_VOICES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "buenas noticias",
  "bufón",
  "burbujas",
  "campanas",
  "cellos",
  "good news",
  "jester",
  "malas noticias",
  "organ",
  "órgano",
  "superestrella",
  "superstar",
  "susurro",
  "trinoids",
  "violonchelos",
  "whisper",
  "wobble",
  "zarvox",
])

type SpeechVoice = Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI" | "default" | "localService">

type SpeechStorage = Pick<Storage, "getItem" | "setItem">

export function speechLanguage(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0] ?? ""
}

/** The real voices for a language, by name, for a picker to offer. */
export function listSpeechVoices<Voice extends SpeechVoice>(
  voices: readonly Voice[],
  lang: string
): Voice[] {
  const language = speechLanguage(lang)

  return voices
    .filter(
      (voice) =>
        speechLanguage(voice.lang) === language &&
        !NOVELTY_VOICES.has(voice.name.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The saved voice, or else the system default if it speaks the language, or a
 * local voice, which unlike a remote one works offline and does not cut out on
 * long messages. `undefined` leaves the choice to the browser.
 */
export function pickSpeechVoice<Voice extends SpeechVoice>(
  voices: readonly Voice[],
  lang: string,
  preferences: SpeechPreferences
): Voice | undefined {
  const candidates = listSpeechVoices(voices, lang)
  const saved = preferences.voices[speechLanguage(lang)]

  return (
    candidates.find(({ voiceURI }) => voiceURI === saved) ??
    candidates.find((voice) => voice.default) ??
    candidates.find((voice) => voice.localService) ??
    candidates[0]
  )
}

/** Never throws: storage can be blocked, and speech works without it. */
export function readSpeechPreferences(storage: SpeechStorage): SpeechPreferences {
  try {
    const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")

    if (typeof stored !== "object" || stored === null) return DEFAULT_SPEECH_PREFERENCES

    const { voices, rate } = stored as Partial<SpeechPreferences>

    return {
      voices: typeof voices === "object" && voices !== null ? voices : {},
      rate: SPEECH_RATES.includes(rate as number) ? (rate as number) : 1,
    }
  } catch {
    return DEFAULT_SPEECH_PREFERENCES
  }
}

export function saveSpeechPreferences(preferences: SpeechPreferences, storage: SpeechStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    /* The choice lasts until the page is left. */
  }
}
