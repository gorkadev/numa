import { speechLanguage } from "@/lib/speech-preferences"

/** Below this the browser's answer is a guess, so ours is as good. */
const MIN_CONFIDENCE = 0.7

/** Enough text to tell, and a bound on a very long message. */
const SAMPLE_LENGTH = 2000

const ENGLISH_WORDS = new Set(
  "the and you your with for that this are was have has will can from not but it's i've i'm".split(" ")
)

const SPANISH_WORDS = new Set(
  "el la los las una un que de del para con por como pero más está están es en y lo se".split(" ")
)

type LanguageDetectorApi = {
  availability: () => Promise<string>
  create: () => Promise<{
    detect: (text: string) => Promise<{ detectedLanguage?: string; confidence?: number }[]>
  }>
}

/**
 * Tells this app's two languages apart by their commonest words, for a browser
 * with no detector of its own. Anything else keeps `fallback`.
 */
export function guessMessageLanguage(text: string, fallback: string): string {
  let english = 0
  let spanish = 0

  for (const word of text.slice(0, SAMPLE_LENGTH).toLowerCase().split(/[^\p{L}']+/u)) {
    if (ENGLISH_WORDS.has(word)) english += 1
    if (SPANISH_WORDS.has(word)) spanish += 1
  }

  if (english === spanish) return fallback

  return english > spanish ? "en" : "es"
}

/** The browser's built-in detector, on Chromium only; `undefined` elsewhere. */
export function browserLanguageDetector(): LanguageDetectorApi | undefined {
  return (globalThis as { LanguageDetector?: LanguageDetectorApi }).LanguageDetector
}

/**
 * The browser's answer, or `null` when it has none. Only a model already on the
 * device is used, so a click never starts a download.
 */
export async function detectWithBrowser(
  text: string,
  detector: LanguageDetectorApi
): Promise<string | null> {
  try {
    if ((await detector.availability()) !== "available") return null

    const instance = await detector.create()
    const [best] = await instance.detect(text.slice(0, SAMPLE_LENGTH))
    const language = best?.detectedLanguage

    if (!language || language === "und" || (best.confidence ?? 0) < MIN_CONFIDENCE) return null

    return speechLanguage(language)
  } catch {
    return null
  }
}
