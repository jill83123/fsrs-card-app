/*
 * English (American) → Kokoro phonemes.
 *
 * A trimmed port of misaki's English G2P (misaki/en.py and misaki/espeak.py, Apache-2.0),
 * which is what Kokoro-82M was trained on: words are looked up in misaki's gold and
 * silver pronunciation dictionaries (with its -s / -ed / -ing rules), and anything they
 * do not cover is phonemized by espeak-ng and mapped onto misaki's phoneme set.
 * spaCy's part-of-speech tagger is not available here, so heteronyms such as "record"
 * get their default reading.
 */
import goldUrl from './data/us_gold.json?url'
import silverUrl from './data/us_silver.json?url'
import { fetchCached } from './fetchCache'
import { phonemize } from './espeak'

type Entry = string | Record<string, string | null>
type Dict = Record<string, Entry>

const PRIMARY = 'ˈ'
const SECONDARY = 'ˌ'
const STRESSES = PRIMARY + SECONDARY
const VOWELS = new Set('AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ')
const CONSONANTS = new Set('bdfhjklmnpstvwzðŋɡɹɾʃʒʤʧθ')
const US_TAUS = new Set('AIOWYiuæɑəɛɪɹʊʌ')
const PUNCTS = new Set(';:,.!?—…"“”')
const NON_QUOTE_PUNCTS = new Set(';:,.!?—…')
const SYMBOLS: Record<string, string> = { '%': 'percent', '&': 'and', '+': 'plus', '@': 'at' }

// --- dictionaries ------------------------------------------------------------
let lexicon: Promise<{ gold: Dict; silver: Dict }> | null = null

export function preloadEnglishG2p() {
  lexicon ??= Promise.all(
    [goldUrl, silverUrl].map(
      async (url) => JSON.parse(new TextDecoder().decode(await fetchCached(url))) as Dict,
    ),
  ).then(([gold, silver]) => ({ gold: gold!, silver: silver! }))
  lexicon.catch(() => (lexicon = null))
  return lexicon
}

const isLower = (w: string) => w === w.toLowerCase()
const isUpper = (w: string) => w === w.toUpperCase()
const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

/**
 * Dictionary entry for `w`; like misaki's grow_dictionary, a lowercase key also answers
 * its capitalised form and vice versa.
 */
function entry(d: Dict, w: string): Entry | undefined {
  if (w in d) return d[w]
  if (w.length < 2) return undefined
  if (isLower(w)) return d[capitalize(w)]
  if (w === capitalize(w)) return d[w.toLowerCase()]
  return undefined
}

// --- stress --------------------------------------------------------------------
/** Move every stress mark to just before the vowel it belongs to. */
function restress(ps: string) {
  const chars = [...ps]
  const order = chars.map((c, i) => {
    if (!STRESSES.includes(c)) return i
    const j = chars.findIndex((v, k) => k > i && VOWELS.has(v))
    return j === -1 ? i : j - 0.5
  })
  return chars
    .map((c, i) => [order[i]!, c] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c)
    .join('')
}

function applyStress(ps: string, stress: number | null): string {
  const hasPrimary = ps.includes(PRIMARY)
  const hasAny = hasPrimary || ps.includes(SECONDARY)
  const hasVowel = [...ps].some((c) => VOWELS.has(c))
  if (stress === null) return ps
  if (stress < -1) return ps.replaceAll(PRIMARY, '').replaceAll(SECONDARY, '')
  if (stress === -1 || ((stress === 0 || stress === -0.5) && hasPrimary))
    return ps.replaceAll(SECONDARY, '').replaceAll(PRIMARY, SECONDARY)
  if ([0, 0.5, 1].includes(stress) && !hasAny) return hasVowel ? restress(SECONDARY + ps) : ps
  if (stress >= 1 && !hasPrimary && ps.includes(SECONDARY)) return ps.replaceAll(SECONDARY, PRIMARY)
  if (stress > 1 && !hasAny) return hasVowel ? restress(PRIMARY + ps) : ps
  return ps
}

// --- word lookup -----------------------------------------------------------------
interface Ctx {
  /** does the next word start with a vowel? null at the end of a clause */
  futureVowel: boolean | null
  futureTo: boolean
}

class Lexicon {
  constructor(
    private gold: Dict,
    private silver: Dict,
  ) {}

  isKnown(w: string) {
    return (
      entry(this.gold, w) !== undefined ||
      entry(this.silver, w) !== undefined ||
      w in SYMBOLS ||
      (/^[a-z]$/i.test(w) && w.length === 1)
    )
  }

  /** Spell a word out letter by letter (acronyms). */
  spell(w: string): string | null {
    const ps = [...w].filter((c) => /[a-z]/i.test(c)).map((c) => this.gold[c.toUpperCase()])
    if (!ps.length || ps.some((p) => typeof p !== 'string')) return null
    const parts = applyStress(ps.join(''), 0).split(SECONDARY)
    const last = parts.pop()!
    return parts.length ? parts.join(SECONDARY) + PRIMARY + last : last
  }

  lookup(word: string, stress: number | null, ctx: Ctx): string | null {
    let w = word
    if (isUpper(w) && !(w in this.gold)) w = w.toLowerCase()
    let e = entry(this.gold, w)
    if (e === undefined) e = entry(this.silver, w)
    if (e !== undefined && typeof e !== 'string') {
      // no POS tagger: the clause-final reading where one exists, otherwise the default
      e = ctx.futureVowel === null && 'None' in e ? e.None! : e.DEFAULT!
    }
    if (e == null) return null
    return applyStress(e, stress)
  }

  special(word: string, ctx: Ctx, inPhrase: boolean): string | null {
    if (word in SYMBOLS) return this.lookup(SYMBOLS[word]!, null, ctx)
    switch (word) {
      case 'a':
      case 'A':
        // an article inside a phrase, the letter name on its own
        return inPhrase ? 'ɐ' : 'ˈA'
      case 'an':
      case 'An':
        return 'ɐn'
      case 'I':
        return SECONDARY + 'I'
      case 'to':
      case 'To':
        return ctx.futureVowel === null
          ? (this.lookup('to', null, ctx) ?? 'tu')
          : ctx.futureVowel
            ? 'tʊ'
            : 'tə'
      case 'in':
      case 'In':
        return (ctx.futureVowel === null ? PRIMARY : '') + 'ɪn'
      case 'the':
      case 'The':
        return ctx.futureVowel === true ? 'ði' : 'ðə'
      case 'used':
      case 'Used': {
        const e = this.gold.used
        if (typeof e === 'string' || !e) return null
        return (ctx.futureTo ? e.VBD : e.DEFAULT) ?? null
      }
    }
    return null
  }

  stemS(word: string, stress: number | null, ctx: Ctx): string | null {
    if (word.length < 3 || !word.endsWith('s')) return null
    let stem: string
    if (!word.endsWith('ss') && this.isKnown(word.slice(0, -1))) stem = word.slice(0, -1)
    else if (
      (word.endsWith("'s") || (word.length > 4 && word.endsWith('es') && !word.endsWith('ies'))) &&
      this.isKnown(word.slice(0, -2))
    )
      stem = word.slice(0, -2)
    else if (word.length > 4 && word.endsWith('ies') && this.isKnown(word.slice(0, -3) + 'y'))
      stem = word.slice(0, -3) + 'y'
    else return null
    const ps = this.lookup(stem, stress, ctx)
    if (!ps) return null
    const last = ps.at(-1)!
    if ('ptkfθ'.includes(last)) return ps + 's'
    if ('szʃʒʧʤ'.includes(last)) return ps + 'ᵻz'
    return ps + 'z'
  }

  stemEd(word: string, stress: number | null, ctx: Ctx): string | null {
    if (word.length < 4 || !word.endsWith('d')) return null
    let stem: string
    if (!word.endsWith('dd') && this.isKnown(word.slice(0, -1))) stem = word.slice(0, -1)
    else if (
      word.length > 4 &&
      word.endsWith('ed') &&
      !word.endsWith('eed') &&
      this.isKnown(word.slice(0, -2))
    )
      stem = word.slice(0, -2)
    else return null
    const ps = this.lookup(stem, stress, ctx)
    if (!ps) return null
    const last = ps.at(-1)!
    if ('pkfθʃsʧ'.includes(last)) return ps + 't'
    if (last === 'd') return ps + 'ᵻd'
    if (last !== 't') return ps + 'd'
    if (ps.length < 2) return ps + 'ɪd'
    if (US_TAUS.has(ps.at(-2)!)) return ps.slice(0, -1) + 'ɾᵻd'
    return ps + 'ᵻd'
  }

  stemIng(word: string, stress: number | null, ctx: Ctx): string | null {
    if (word.length < 5 || !word.endsWith('ing')) return null
    let stem: string
    if (word.length > 5 && this.isKnown(word.slice(0, -3))) stem = word.slice(0, -3)
    else if (this.isKnown(word.slice(0, -3) + 'e')) stem = word.slice(0, -3) + 'e'
    else if (
      word.length > 5 &&
      /([bcdgklmnprstvxz])\1ing$|cking$/.test(word) &&
      this.isKnown(word.slice(0, -4))
    )
      stem = word.slice(0, -4)
    else return null
    const ps = this.lookup(stem, stress, ctx)
    if (!ps) return null
    if (ps.length > 1 && ps.at(-1) === 't' && US_TAUS.has(ps.at(-2)!))
      return ps.slice(0, -1) + 'ɾɪŋ'
    return ps + 'ɪŋ'
  }

  word(raw: string, ctx: Ctx, inPhrase: boolean): string | null {
    let word = raw
    // capitalised words get a little extra stress, shouting gets more (misaki's cap_stresses)
    const stress = isLower(word) ? null : isUpper(word) ? 2 : 0.5
    const sp = this.special(word, ctx, inPhrase)
    if (sp !== null) return sp
    const wl = word.toLowerCase()
    if (
      word.length > 1 &&
      !isLower(word) &&
      entry(this.gold, word) === undefined &&
      entry(this.silver, word) === undefined &&
      (isUpper(word) || word.slice(1) === word.slice(1).toLowerCase()) &&
      (this.isKnown(wl) ||
        this.stemS(wl, stress, ctx) ||
        this.stemEd(wl, stress, ctx) ||
        this.stemIng(wl, stress, ctx))
    )
      word = wl
    if (this.isKnown(word)) {
      const ps = this.lookup(word, stress, ctx)
      if (ps) return ps
    }
    if (word.endsWith("s'") && this.isKnown(word.slice(0, -2) + "'s"))
      return this.lookup(word.slice(0, -2) + "'s", stress, ctx)
    if (word.endsWith("'") && this.isKnown(word.slice(0, -1)))
      return this.lookup(word.slice(0, -1), stress, ctx)
    const ps =
      this.stemS(word, stress, ctx) ??
      this.stemEd(word, stress, ctx) ??
      this.stemIng(word, 0.5, ctx)
    if (ps) return ps
    // short all-caps words that are not in the dictionary are acronyms: spell them
    if (/^[A-Z]{2,5}$/.test(word)) return this.spell(word)
    return null
  }
}

// --- espeak-ng fallback ---------------------------------------------------------------
// misaki's EspeakFallback.E2M; this espeak build writes diphthongs without tie bars
const E2M = (
  [
    ['ʔˌn\u0329', 'ʔn'],
    ['ʔn\u0329', 'ʔn'],
    ['aɪ', 'I'],
    ['aʊ', 'W'],
    ['dʒ', 'ʤ'],
    ['eɪ', 'A'],
    ['e', 'A'],
    ['tʃ', 'ʧ'],
    ['ɔɪ', 'Y'],
    ['ʲo', 'jo'],
    ['ʲə', 'jə'],
    ['ʲ', ''],
    ['ɚ', 'əɹ'],
    ['r', 'ɹ'],
    ['x', 'k'],
    ['ç', 'k'],
    ['ɐ', 'ə'],
    ['ɬ', 'l'],
    ['\u0303', ''],
  ] as [string, string][]
).sort((a, b) => b[0].length - a[0].length)

export function espeakToMisaki(ipa: string): string {
  let ps = ipa.trim()
  for (const [from, to] of E2M) ps = ps.replaceAll(from, to)
  ps = ps.replace(/(\S)\u0329/g, 'ᵊ$1').replaceAll('\u0329', '')
  ps = ps
    .replaceAll('oʊ', 'O')
    .replaceAll('ɜːɹ', 'ɜɹ')
    .replaceAll('ɜː', 'ɜɹ')
    .replaceAll('ɪə', 'iə')
    .replaceAll('ː', '')
    .replaceAll('o', 'ɔ')
  // espeak writes a weak "ar-" / "cor-" before r as ɚɹ ("arrange" → ɚɹˈeɪndʒ), which
  // would read as a doubled r: keep a single one
  return ps.replace(/ɹ([ˈˌ]?)ɹ/g, '$1ɹ')
}

/** espeak-ng phonemes for each word, in one espeak run. */
async function espeakWords(words: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!words.length) return out
  const strip = (s: string) => s.replace(/[\s.,;:!?]+/g, '')
  const sentences = await phonemize(words.join('. ') + '.', 'en-us')
  if (sentences.length === words.length) {
    words.forEach((w, i) => out.set(w, espeakToMisaki(strip(sentences[i]!.join('')))))
  } else {
    // sentence splitting did not line up with the words: phonemize them one at a time
    for (const w of words) {
      out.set(w, espeakToMisaki(strip((await phonemize(w, 'en-us')).flat().join(''))))
    }
  }
  return out
}

// --- text ------------------------------------------------------------------------------
interface Token {
  text: string
  /** whitespace that followed the token */
  space: string
  kind: 'word' | 'punct' | 'other'
  ps?: string | null
}

// amounts keep their currency sign so espeak reads "$25" as "twenty-five dollars"
const TOKEN_RE =
  /([A-Za-z]+(?:['-][A-Za-z]+)*'?|[$£€]?\d[\d,]*(?:\.\d+)?(?:st|nd|rd|th|s)?|\S)(\s*)/g

function tokenize(text: string): Token[] {
  const clean = text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/–/g, '—')
  return [...clean.trim().matchAll(TOKEN_RE)].map((m) => {
    const t = m[1]!
    const kind = /^[A-Za-z]/.test(t) ? 'word' : PUNCTS.has(t) ? 'punct' : 'other'
    return { text: t, space: m[2] ? ' ' : '', kind }
  })
}

function nextCtx(ctx: Ctx, ps: string | null | undefined, text: string): Ctx {
  let futureVowel = ctx.futureVowel
  if (ps) {
    for (const c of ps) {
      if (NON_QUOTE_PUNCTS.has(c)) {
        futureVowel = null
        break
      }
      if (VOWELS.has(c) || CONSONANTS.has(c)) {
        futureVowel = VOWELS.has(c)
        break
      }
    }
  }
  return { futureVowel, futureTo: text === 'to' || text === 'To' }
}

/** Convert English text to Kokoro's phoneme string. */
export async function englishToPhonemes(text: string): Promise<string> {
  const { gold, silver } = await preloadEnglishG2p()
  const lex = new Lexicon(gold, silver)
  const tokens = tokenize(text)
  const inPhrase = tokens.filter((t) => t.kind === 'word').length > 1

  // words are resolved right to left so "the" / "to" can look at the next sound
  let ctx: Ctx = { futureVowel: null, futureTo: false }
  for (const t of [...tokens].reverse()) {
    if (t.kind === 'punct') t.ps = t.text
    else if (t.kind === 'word') {
      t.ps = lex.word(t.text, ctx, inPhrase)
      // hyphenated words the dictionaries lack: read each part
      if (t.ps === null && t.text.includes('-')) {
        const parts = t.text.split('-').map((p) => lex.word(p, ctx, inPhrase))
        if (parts.every((p) => p !== null)) t.ps = parts.join('')
      }
    } else if (t.text in SYMBOLS) t.ps = lex.lookup(SYMBOLS[t.text]!, null, ctx)
    else if (/^[$£€]?\d/.test(t.text))
      t.ps = null // numbers are read by espeak
    else t.ps = ''
    ctx = nextCtx(ctx, t.ps, t.text)
  }

  const unknown = [...new Set(tokens.filter((t) => t.ps === null).map((t) => t.text))]
  const fallback = await espeakWords(unknown)
  for (const t of tokens) if (t.ps === null) t.ps = fallback.get(t.text) ?? ''

  return tokens
    .map((t) => t.ps! + (t.ps || t.kind === 'punct' ? t.space : ''))
    .join('')
    .trim()
    .replaceAll('ɾ', 'T')
    .replaceAll('ʔ', 't')
}

// --- user-written readings ----------------------------------------------------------
// IPA / KK symbol sequences → misaki (longest first). A lone e / o is handled separately:
// KK writes [e] [o] for eɪ oʊ, while dictionary IPA (Cambridge) writes /e/ for ɛ.
const IPA2M = (
  [
    ['t\u0361ʃ', 'ʧ'],
    ['d\u0361ʒ', 'ʤ'],
    ['tʃ', 'ʧ'],
    ['dʒ', 'ʤ'],
    ['eɪ', 'A'],
    ['aɪ', 'I'],
    ['aʊ', 'W'],
    ['ɔɪ', 'Y'],
    ['oʊ', 'O'],
    ['əʊ', 'O'],
    ['ɜːr', 'ɜɹ'],
    ['ɜː', 'ɜɹ'],
    ['ɝ', 'ɜɹ'],
    ['ɚ', 'əɹ'],
    ['ɪə', 'iə'],
    ['o', 'O'],
    ['a', 'ɑ'],
    ['ɒ', 'ɑ'],
    ['ɐ', 'ə'],
    ['ɨ', 'ᵻ'],
    ['r', 'ɹ'],
    ['ɫ', 'l'],
    ['g', 'ɡ'],
    ['ʍ', 'w'],
    ['y', 'j'],
    ['ɾ', 'T'],
    ['ʔ', 't'],
    ['ˋ', 'ˈ'],
    ['ˏ', 'ˌ'],
    ["'", 'ˈ'],
    ['ː', ''],
  ] as [string, string][]
).sort((a, b) => b[0].length - a[0].length)

const MISAKI_US = new Set('AIOWYbdfhijklmnpstuvwzæðŋɑɔəɛɜɡɪɹʃʊʌʒʤʧˈˌθᵊᵻT')

/**
 * Turn a reading typed on a card (IPA such as /əˈreɪndʒ/ or KK such as [əˋrendʒ]) into
 * Kokoro phonemes. Only the first reading is used when several are given. Returns null
 * when the text does not look like a phonetic transcription, so the word is used instead.
 */
export function readingToPhonemes(reading: string): string | null {
  const r = reading.normalize('NFD').trim()
  // the first /…/ or […] transcription; notes around it such as "(n.)" are dropped
  const m = /\/([^/]+)\/|\[([^\]]+)\]/.exec(r)
  const first = m ? (m[1] ?? m[2]!) : r.split(/[,;，；、]|\s(?:or|\/)\s/)[0]!
  // Taiwan's KK is printed in square brackets and marks stress with ˋ ˏ or accents
  const kk = !!m?.[2] || /[ˋˏ\u0300\u0301]/.test(first)
  let ps = first
    .replace(/[\s.‿]/g, '')
    .replace(/[()]/g, '')
    // stress written as an accent over the vowel (KK): move it in front as a mark
    .replace(/(.)\u0301/g, 'ˈ$1')
    .replace(/(.)\u0300/g, 'ˌ$1')
    .replace(/[\u0361\u035c]/g, '')
  if (!ps || /[A-Z]/.test(ps)) return null
  for (const [from, to] of IPA2M) ps = ps.replaceAll(from, to)
  ps = ps.replaceAll('e', kk ? 'A' : 'ɛ')
  // syllabic consonants (a syllabic n or l, as in "button") carry a schwa in misaki
  ps = ps.replace(/(\S)\u0329/g, 'ᵊ$1').replace(/[\u0300-\u036f]/g, '')
  if (![...ps].every((c) => MISAKI_US.has(c))) return null
  // one mark per syllable; an unmarked reading (/red/) is stressed like the dictionary's
  if (!/[ˈˌ]/.test(ps)) return applyStress(ps, 2)
  return restress(ps).replace(/([ˈˌ])[ˈˌ]+/g, '$1')
}
