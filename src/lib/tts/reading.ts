/*
 * Use the reading written on a vocab card to pronounce the word when it can be trusted:
 * kana for Japanese, Hangul for Korean, IPA / KK for English. Anything else (or several
 * readings at once) is ignored and the word itself is spoken.
 */
import type { Lang } from '@/db/types'
import { readingToPhonemes } from './enG2p'

export interface SpeechInput {
  /** text handed to the engine */
  text: string
  /** Kokoro phonemes that replace the text's own conversion (English readings) */
  phonemes?: string
}

/** A single reading: nothing that separates alternatives. */
const single = (r: string) => !/[,;，；、/／|｜]|\bor\b/.test(r)

function kana(reading: string) {
  const r = reading.replace(/[\s・·.()（）]/g, '')
  return r && single(reading) && /^[ぁ-ゟ゠-ヿー]+$/.test(r) ? r : null
}

function hangul(reading: string) {
  // dictionaries often wrap the pronunciation in brackets: [익따]
  const r = reading.replace(/[[\]()（）]/g, '').trim()
  return r && single(reading) && /^[가-힣\s]+$/.test(r) ? r : null
}

export function speechInput(text: string, lang: Lang, reading?: string): SpeechInput {
  const r = reading?.trim()
  if (!r) return { text }
  if (lang === 'ja') return { text: kana(r) ?? text }
  if (lang === 'ko') return { text: hangul(r) ?? text }
  const phonemes = readingToPhonemes(r)
  return phonemes ? { text, phonemes } : { text }
}
