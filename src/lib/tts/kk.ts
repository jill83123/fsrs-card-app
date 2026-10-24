/*
 * KK phonetic symbols (the notation Taiwan's dictionaries print in [ ]) for English words,
 * converted from the misaki phonemes that Kokoro's dictionary yields. Misaki keeps stress
 * right before the vowel, while KK puts the mark in front of the whole syllable.
 */
import { englishToPhonemes } from './enG2p'

const MISAKI_VOWELS = new Set('AIOWYæɑɔəɛɜɪʊʌiuᵻᵊ')
const DIPHTHONG: Record<string, string> = { A: 'e', I: 'aɪ', O: 'o', W: 'aʊ', Y: 'ɔɪ' }
const SIMPLE: Record<string, string> = {
  ʧ: 'tʃ',
  ʤ: 'dʒ',
  ɹ: 'r',
  ɡ: 'g',
  T: 't',
  ʔ: 't',
  ᵻ: 'ɪ',
  ᵊ: 'ə',
}
const NUCLEI = new Set([...'iɪeɛæɑɔoʊuʌəɝɚ', 'aɪ', 'aʊ', 'ɔɪ'])
const STRESS: Record<string, string> = { ˈ: 'ˋ', ˌ: 'ˏ' }

const isNucleus = (t: string) => NUCLEI.has(t)
const isMark = (t: string) => t in STRESS
const isConsonant = (t: string) => !isNucleus(t) && !isMark(t) && t !== ' '

// consonant clusters that can start a syllable
const STOPS = new Set('pbtdkgfvθ')
const LIQUID = new Set('lrw')
function validOnset(c: string[]): boolean {
  if (c.length === 2) {
    const [a, b] = c as [string, string]
    if ((STOPS.has(a) || a === 'ʃ') && LIQUID.has(b)) return true
    if (a === 's' && ('ptkmnfl'.includes(b) || b === 'w')) return true
    return 'pbtdkgfvmnhszθl'.includes(a) && b === 'j'
  }
  if (c.length === 3) {
    const [a, b, d] = c as [string, string, string]
    return a === 's' && 'ptk'.includes(b) && 'lrwj'.includes(d)
  }
  return false
}

/** Convert one misaki string (words separated by spaces) to KK symbols, without brackets. */
export function misakiToKk(ps: string): string {
  const chars = [...ps.replace(/[,.;:!?"“”()]/g, '')]
  const toks: string[] = []
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!
    const next = chars[i + 1]
    if (c === 'ɜ') {
      toks.push('ɝ')
      if (next === 'ɹ') i++
    } else if (c === 'ə' && next === 'ɹ' && !MISAKI_VOWELS.has(chars[i + 2] ?? '')) {
      toks.push('ɚ')
      i++
    } else toks.push(DIPHTHONG[c] ?? SIMPLE[c] ?? c)
  }
  // split into words, handle each on its own
  const words: string[][] = [[]]
  for (const t of toks) {
    if (t === ' ') words.push([])
    else words[words.length - 1]!.push(t)
  }
  return words
    .filter((w) => w.length)
    .map((w) => {
      // one syllable: dictionaries print no stress mark
      let t = w.filter((x) => isNucleus(x)).length <= 1 ? w.filter((x) => !isMark(x)) : w
      for (let k = 0; k < t.length; k++) {
        if (!isMark(t[k]!)) continue
        // the mark goes in front of the syllable's onset consonants
        let s = k
        while (s > 0 && isConsonant(t[s - 1]!)) s--
        const run = t.slice(s, k)
        let onset = Math.min(run.length, 1)
        for (const n of [3, 2]) {
          if (run.length >= n && validOnset(run.slice(-n))) {
            onset = n
            break
          }
        }
        const mark = STRESS[t[k]!]!
        t = [...t.slice(0, k - onset), mark, ...t.slice(k - onset, k), ...t.slice(k + 1)]
      }
      return t.join('')
    })
    .join(' ')
}

/** KK for an English word or phrase, e.g. "[rɪˋkwaɪrmənt]"; null when nothing could be produced. */
export async function generateKk(text: string): Promise<string | null> {
  const kk = misakiToKk(await englishToPhonemes(text))
  return kk ? `[${kk}]` : null
}
