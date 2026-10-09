/*
 * Fill in a vocab card's reading: IPA from espeak-ng for English, hiragana from
 * kuromoji for Japanese, Revised Romanization for Korean.
 */
import type { Lang } from '@/db/types'
import { phonemize } from './espeak'
import { japaneseToKana } from './jaG2p'
import { romanizeKorean } from '@/lib/romanize'

export const canAutoReading = (lang: Lang) => lang === 'en' || lang === 'ja' || lang === 'ko'

/** Returns the reading, or null when none could be produced. */
export async function generateReading(word: string, lang: Lang): Promise<string | null> {
  const w = word.trim()
  if (!w) return null
  if (lang === 'ja') return japaneseToKana(w)
  if (lang === 'ko') return /[가-힣]/.test(w) ? romanizeKorean(w) : null
  if (lang === 'en') {
    const ipa = (await phonemize(w, 'en-us'))
      .flat()
      .join('')
      .replace(/[\s.,;:!?]+/g, ' ')
      .trim()
    return ipa ? `/${ipa}/` : null
  }
  return null
}
