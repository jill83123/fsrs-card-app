/*
 * Korean → Revised Romanization of the *spoken* form: liaison (먹어 → meogeo), nasalization
 * (백마 → baengma), liquidization (신라 → silla), aspiration (좋다 → jota) and palatalization
 * (같이 → gachi) are applied. Like the official system, tensification is not written
 * (학교 → hakgyo).
 */

const ONSET = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('')
const VOWEL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.split('')
const CODA = [
  '', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ',
  'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

const R_ONSET: Record<string, string> = {
  ㄱ: 'g', ㄲ: 'kk', ㄴ: 'n', ㄷ: 'd', ㄸ: 'tt', ㅁ: 'm', ㅂ: 'b', ㅃ: 'pp', ㅅ: 's', ㅆ: 'ss',
  ㅇ: '', ㅈ: 'j', ㅉ: 'jj', ㅊ: 'ch', ㅋ: 'k', ㅌ: 't', ㅍ: 'p', ㅎ: 'h',
}
const R_VOWEL = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we',
  'wi', 'yu', 'eu', 'ui', 'i',
]
// a coda is read as one of seven sounds
const R_CODA: Record<string, string> = {
  ㄱ: 'k', ㄴ: 'n', ㄷ: 't', ㄹ: 'l', ㅁ: 'm', ㅂ: 'p', ㅇ: 'ng',
}
// sound a coda jamo is read as when nothing follows it
const NEUTRAL: Record<string, string> = {
  ㄱ: 'ㄱ', ㄲ: 'ㄱ', ㅋ: 'ㄱ', ㄴ: 'ㄴ', ㄷ: 'ㄷ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ',
  ㅌ: 'ㄷ', ㅎ: 'ㄷ', ㄹ: 'ㄹ', ㅁ: 'ㅁ', ㅂ: 'ㅂ', ㅍ: 'ㅂ', ㅇ: 'ㅇ',
}
// of two coda consonants, the one that is still pronounced before another consonant
const COMPOUND_KEEP: Record<string, string> = {
  ㄱㅅ: 'ㄱ', ㄴㅈ: 'ㄴ', ㄹㄱ: 'ㄱ', ㄹㅁ: 'ㅁ', ㄹㅂ: 'ㄹ', ㄹㅅ: 'ㄹ', ㄹㅌ: 'ㄹ', ㄹㅍ: 'ㅂ',
  ㅂㅅ: 'ㅂ',
}
const ASPIRATE: Record<string, string> = { ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅈ: 'ㅊ', ㅂ: 'ㅍ' }
const NASAL: Record<string, string> = { ㄱ: 'ㅇ', ㄷ: 'ㄴ', ㅂ: 'ㅁ' }

interface Syl {
  l: string
  v: string
  t: string
}

function romanizeWord(word: string): string {
  const syls: Syl[] = [...word].map((ch) => {
    const n = ch.charCodeAt(0) - 0xac00
    return { l: ONSET[Math.floor(n / 588)]!, v: VOWEL[Math.floor((n % 588) / 28)]!, t: CODA[n % 28]! }
  })

  for (let i = 0; i < syls.length - 1; i++) {
    const a = syls[i]!
    const b = syls[i + 1]!
    if (!a.t) continue

    // ㅎ after the coda: aspirates ㄱㄷㅈ, otherwise silent
    if (a.t.endsWith('ㅎ')) {
      const aspirated = b.l in ASPIRATE && b.l !== 'ㅂ'
      if (aspirated) b.l = ASPIRATE[b.l]!
      a.t = a.t.length === 1 ? (aspirated || b.l === 'ㅇ' ? '' : 'ㄷ') : a.t.slice(0, -1)
      if (!a.t) continue
    }

    const lastSound = NEUTRAL[a.t.at(-1)!] ?? ''
    if (b.l === 'ㅎ' && lastSound in ASPIRATE) {
      b.l = ASPIRATE[lastSound]!
      a.t = a.t.slice(0, -1)
    } else if (b.l === 'ㅇ') {
      // liaison: the coda moves onto the next syllable (ㅇ stays)
      if (a.t === 'ㅇ') continue
      let moved = a.t.at(-1)!
      a.t = a.t.slice(0, -1)
      if (moved === 'ㅅ' && a.t) moved = 'ㅆ'
      if (b.v === 'ㅣ' && !a.t) moved = moved === 'ㄷ' ? 'ㅈ' : moved === 'ㅌ' ? 'ㅊ' : moved
      b.l = moved
    } else {
      let t = a.t.length > 1 ? COMPOUND_KEEP[a.t]! : NEUTRAL[a.t]!
      t = NEUTRAL[t] ?? t
      if (t in NASAL && (b.l === 'ㄴ' || b.l === 'ㅁ' || b.l === 'ㄹ')) {
        t = NASAL[t]!
        if (b.l === 'ㄹ') b.l = 'ㄴ'
      } else if ((t === 'ㅁ' || t === 'ㅇ') && b.l === 'ㄹ') b.l = 'ㄴ'
      else if (t === 'ㄴ' && b.l === 'ㄹ') t = 'ㄹ'
      else if (t === 'ㄹ' && b.l === 'ㄴ') b.l = 'ㄹ'
      a.t = t
    }
  }

  let out = ''
  syls.forEach((s, i) => {
    const prevT = i > 0 ? syls[i - 1]!.t : ''
    out += s.l === 'ㄹ' ? (prevT === 'ㄹ' ? 'l' : 'r') : R_ONSET[s.l]
    out += R_VOWEL[VOWEL.indexOf(s.v)]
    if (s.t) {
      const last = s.t.length > 1 ? COMPOUND_KEEP[s.t]! : s.t
      out += R_CODA[NEUTRAL[last] ?? last] ?? ''
    }
  })
  return out
}

/** Romanize the Hangul in `text`; everything else (spaces, punctuation) is kept. */
export function romanizeKorean(text: string): string {
  return text
    .split(/([가-힣]+)/)
    .map((p) => (/^[가-힣]+$/.test(p) ? romanizeWord(p) : p))
    .join('')
}
