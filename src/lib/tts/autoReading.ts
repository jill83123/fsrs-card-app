/*
 * Fill in a vocab card's reading: IPA from espeak-ng for English, hiragana from
 * kuromoji for Japanese, Revised Romanization for Korean. English can be written as KK instead.
 */
import type { Lang } from '@/db/types'
import { phonemize } from './espeak'
import { japaneseToKana } from './jaG2p'
import { romanizeKorean } from '@/lib/romanize'
import { generateKk } from './kk'

export const canAutoReading = (lang: Lang) => lang === 'en' || lang === 'ja' || lang === 'ko'

/** Returns the reading, or null when none could be produced. */
export async function generateReading(
  word: string,
  lang: Lang,
  enStyle: 'ipa' | 'kk' = 'ipa',
): Promise<string | null> {
  const w = word.trim()
  if (!w) return null
  if (lang === 'ja') return japaneseToKana(w)
  if (lang === 'ko') return /[가-힣]/.test(w) ? romanizeKorean(w) : null
  if (lang === 'en') {
    if (enStyle === 'kk') return generateKk(w)
    const ipa = (await phonemize(w, 'en-us'))
      .flat()
      .join('')
      .replace(/[\s.,;:!?]+/g, ' ')
      .trim()
    return ipa ? `/${ipa}/` : null
  }
  return null
}
