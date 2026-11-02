import assert from "node:assert/strict"
import test from "node:test"

import { detectWithBrowser, guessMessageLanguage } from "./speech-language"

type Result = { detectedLanguage: string; confidence: number }

function browser(availability: string, results: Result[]) {
  return {
    availability: async () => availability,
    create: async () => ({ detect: async () => results }),
  }
}

test("guesses English and Spanish from their common words", () => {
  assert.equal(
    guessMessageLanguage("I've built the floating islands and you can jump with the keys", "es"),
    "en"
  )
  assert.equal(
    guessMessageLanguage("Voy a dividir la implementación en el módulo de escenario para que", "en"),
    "es"
  )
})

test("a text with no evidence keeps the fallback", () => {
  assert.equal(guessMessageLanguage("OK", "es"), "es")
  assert.equal(guessMessageLanguage("const x = 1", "en"), "en")
})

test("the browser's confident answer is used, reduced to its base language", async () => {
  const detector = browser("available", [{ detectedLanguage: "fr-CA", confidence: 0.98 }])

  assert.equal(await detectWithBrowser("Bonjour", detector), "fr")
})

test("a doubtful or undetermined answer is no answer", async () => {
  for (const results of [
    [{ detectedLanguage: "fr", confidence: 0.4 }],
    [{ detectedLanguage: "und", confidence: 0.99 }],
    [],
  ]) {
    assert.equal(await detectWithBrowser("hmm", browser("available", results)), null)
  }
})

test("a model not on this device is not downloaded for a click", async () => {
  let created = false
  const detector = {
    availability: async () => "downloadable",
    create: async () => {
      created = true
      return { detect: async () => [] }
    },
  }

  assert.equal(await detectWithBrowser("Hello", detector), null)
  assert.equal(created, false)
})

test("a failing browser detector is no answer", async () => {
  const detector = {
    availability: async () => {
      throw new Error("blocked")
    },
    create: async () => ({ detect: async () => [] }),
  }

  assert.equal(await detectWithBrowser("Hello", detector), null)
})
