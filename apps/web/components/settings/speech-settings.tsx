"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-group"
import { routing } from "@/i18n/routing"
import {
  listSpeechVoices,
  readSpeechPreferences,
  saveSpeechPreferences,
  speechLanguage,
  SPEECH_RATES,
  type SpeechPreferences,
} from "@/lib/speech-preferences"

const AUTOMATIC = "automatic"

/** Browsers load their voices late and announce them with `voiceschanged`. */
function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null)

  useEffect(() => {
    const synthesis = window.speechSynthesis
    const read = () => setVoices(synthesis.getVoices())

    read()
    synthesis.addEventListener("voiceschanged", read)

    return () => synthesis.removeEventListener("voiceschanged", read)
  }, [])

  return voices
}

function VoiceRow({
  language,
  voices,
  preferences,
  onChange,
}: {
  /** A base language: this row is the voice for messages written in it. */
  language: string
  voices: SpeechSynthesisVoice[] | null
  preferences: SpeechPreferences | null
  onChange: (next: SpeechPreferences) => void
}) {
  const t = useTranslations("Settings.game")
  const locale = useLocale()
  const languageName = new Intl.DisplayNames(locale, { type: "language" }).of(language) ?? language
  const offered = listSpeechVoices(voices ?? [], language)
  const saved = preferences?.voices[language]
  const items = [
    { value: AUTOMATIC, label: t("speechVoiceAutomatic") },
    ...offered.map(({ name, voiceURI }) => ({ value: voiceURI, label: name })),
  ]
  const labelId = `settings-speech-voice-${language}`

  return (
    <SettingsRow>
      <ItemContent>
        <ItemTitle id={labelId}>{t("speechVoice", { language: languageName })}</ItemTitle>
        <ItemDescription>{t("speechVoiceDescription", { language: languageName })}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {preferences === null || voices === null ? (
          <Skeleton className="h-8 w-28 rounded-2xl" />
        ) : (
          <Select
            value={items.some(({ value }) => value === saved) ? saved : AUTOMATIC}
            onValueChange={(value) => {
              const { [language]: _previous, ...others } = preferences.voices

              onChange({
                ...preferences,
                voices: value === AUTOMATIC || value === null ? others : { ...others, [language]: value },
              })
            }}
            items={items}
          >
            <SelectTrigger aria-labelledby={labelId} className="w-full sm:w-auto">
              <SelectValue />
            </SelectTrigger>
            {/* Wider than its trigger: a voice's name is longer than "Automatic". */}
            <SelectContent alignItemWithTrigger={false} align="end" className="w-64">
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </ItemActions>
    </SettingsRow>
  )
}

/**
 * One voice per language the app speaks, the interface's first, and the speed,
 * kept in this browser. Messages pick their voice by their own language.
 */
function SpeechRows() {
  const t = useTranslations("Settings.game")
  const locale = useLocale()
  const voices = useSpeechVoices()
  const [preferences, setPreferences] = useState<SpeechPreferences | null>(null)

  useEffect(() => {
    setPreferences(readSpeechPreferences(window.localStorage))
  }, [])

  function change(next: SpeechPreferences) {
    setPreferences(next)
    saveSpeechPreferences(next, window.localStorage)
  }

  const languages = [locale, ...routing.locales.filter((language) => language !== locale)]
  const rateItems = SPEECH_RATES.map((rate) => ({ value: rate, label: `${rate}×` }))

  return (
    <SettingsGroup title={t("speechTitle")} settingId="speech-voice">
      {languages.map((language) => (
        <VoiceRow
          key={language}
          language={speechLanguage(language)}
          voices={voices}
          preferences={preferences}
          onChange={change}
        />
      ))}
      <SettingsRow settingId="speech-rate">
        <ItemContent>
          <ItemTitle id="settings-speech-rate">{t("speechRate")}</ItemTitle>
          <ItemDescription>{t("speechRateDescription")}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {preferences === null ? (
            <Skeleton className="h-8 w-18 rounded-2xl" />
          ) : (
            <Select
              value={preferences.rate}
              onValueChange={(rate) => {
                if (rate !== null) change({ ...preferences, rate })
              }}
              items={rateItems}
            >
              <SelectTrigger aria-labelledby="settings-speech-rate" className="w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {rateItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </ItemActions>
      </SettingsRow>
    </SettingsGroup>
  )
}

/** Left out where the browser cannot speak, as the chat's button is. */
export function SpeechSettings() {
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported("speechSynthesis" in window)
  }, [])

  return supported ? <SpeechRows /> : null
}
