/*
 * Japanese → Kokoro phonemes.
 *
 * A port of misaki's "cutlet" Japanese front-end (misaki/cutlet.py, Apache-2.0,
 * adapted from polm/cutlet, MIT), which is what Kokoro-82M was trained on.
 * MeCab/UniDic is replaced by kuromoji.js (IPADIC) for word segmentation and readings.
 */
import { TokenizerBuilder } from '@patdx/kuromoji'
import hepburn from './data/hepburn.json'
import jaWordsUrl from './data/ja_words.txt?url'
import { fetchCached } from './fetchCache'
import { numberToKana } from './num2kana'

const KUROMOJI_DICT = 'https://cdn.jsdelivr.net/npm/@patdx/kuromoji@1.0.4/dict/'

const TABLE: Record<string, string> = hepburn

const KATAKANA_EXT: Record<string, string> = Object.fromEntries(
  [
    'ㇰク',
    'ㇱシ',
    'ㇲス',
    'ㇳト',
    'ㇴヌ',
    'ㇵハ',
    'ㇶヒ',
    'ㇷフ',
    'ㇸヘ',
    'ㇹホ',
    'ㇺム',
    'ㇻラ',
    'ㇼリ',
    'ㇽル',
    'ㇾレ',
    'ㇿロ',
  ].map((s) => [s[0]!, s[1]!]),
)

const SUTEGANA = new Set('ゃゅょぁぃぅぇぉ')
const ODORI = new Set('〃々ゝゞヽ')

/** Character class, mirroring the MeCab char_type values cutlet relies on. */
const CT_SYMBOL = 3
const CT_KANA = 6 // known words and kana are romanised from their reading
const CT_OTHER = 2

interface Word {
  surface: string
  hira: string
  charType: number
}

interface Token {
  surface: string
  space: boolean
}

// --- resources ---------------------------------------------------------------
async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, 2)
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

let tokenizer: ReturnType<TokenizerBuilder['build']> | null = null
function loadTokenizer() {
  tokenizer ??= new TokenizerBuilder({
    loader: {
      async loadArrayBuffer(file: string) {
        return gunzipIfNeeded(await fetchCached(KUROMOJI_DICT + file))
      },
    },
  }).build()
  tokenizer.catch(() => (tokenizer = null))
  return tokenizer
}

let jaWords: Promise<Set<string>> | null = null
function loadJaWords() {
  jaWords ??= fetch(jaWordsUrl)
    .then((r) => r.text())
    .then((t) => new Set(t.split(/\r?\n/).map((l) => l.trim())))
  jaWords.catch(() => (jaWords = null))
  return jaWords
}

/** Warm up the tokenizer and word list (~17MB of dictionaries on first use). */
export const preloadJapaneseG2p = () => Promise.all([loadTokenizer(), loadJaWords()])

// --- helpers -----------------------------------------------------------------
const kata2hira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

const isAscii = (s: string) => [...s].every((c) => c.charCodeAt(0) < 0x80)
const isKana = (s: string) => /^[ぁ-ゖァ-ヺー]+$/.test(s)
const isSymbol = (s: string) => /^[^\p{L}\p{N}]+$/u.test(s)

function normalize(text: string) {
  let t = text.replace(/[〜～](?=\d)/g, 'から')
  for (const [k, v] of Object.entries(KATAKANA_EXT)) t = t.replaceAll(k, v)
  // NFKC: full-width ASCII → half-width, half-width katakana → full-width
  t = t.normalize('NFKC')
  return (t.match(/\d+|\D+/g) ?? [])
    .map((p) => (/^\d+$/.test(p) ? ' ' + numberToKana(p) : p))
    .join('')
}

const ADD_DAKUTEN_FROM = 'かきくけこさしすせそたちつてとはひふへほ'
const ADD_DAKUTEN_TO = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'

function singleMapping(pk: string | undefined, kk: string, nk: string | undefined): string {
  if (ODORI.has(kk)) {
    if ('ゝヽ'.includes(kk)) return pk ?? ''
    if ('ゞヾ'.includes(kk)) {
      if (!pk) return ''
      const i = ADD_DAKUTEN_FROM.indexOf(pk)
      return i >= 0 ? (TABLE[ADD_DAKUTEN_TO[i]!] ?? '') : ''
    }
    return ''
  }
  if (pk && TABLE[pk + kk] !== undefined) return TABLE[pk + kk]!
  if (nk && TABLE[kk + nk] !== undefined) return ''
  if (nk && SUTEGANA.has(nk)) {
    if (kk === 'っ') return ''
    return (TABLE[kk] ?? '').slice(0, -1) + (TABLE[nk] ?? '')
  }
  if (SUTEGANA.has(kk)) return ''
  if (kk === 'ー') return 'ː'
  if (kk === 'っ') return 'ʔ'
  if (kk === 'ん') {
    const t = nk ? TABLE[nk] : undefined
    if (t) {
      if ('mpb'.includes(t[0]!)) return 'm'
      if ('kɡ'.includes(t[0]!)) return 'ŋ'
      if (['ɲ', 'ʨ', 'ʥ'].some((p) => t.startsWith(p))) return 'ɲ'
      if ('ntdɾz'.includes(t[0]!)) return 'n'
    }
    return 'ɴ'
  }
  return TABLE[kk] ?? ''
}

function romajiWord(word: Word): string {
  if (isAscii(word.surface)) return word.surface
  if (word.charType === CT_SYMBOL) return [...word.surface].map((c) => TABLE[c] ?? c).join('')
  if (word.charType !== CT_KANA) return ''
  const h = [...word.hira]
  return h.map((c, i) => singleMapping(h[i - 1], c, h[i + 1])).join('')
}

function toTokens(input: Word[], known: Set<string>): Token[] {
  // merge runs of same-type words that form a dictionary word (affects spacing)
  const groups: Word[][] = []
  for (let i = 0; i < input.length;) {
    let z = input.findIndex((w, k) => k > i && w.charType !== input[i]!.charType)
    if (z < 0) z = input.length
    let j: number | null = null
    for (let k = z; k > i; k--) {
      if (
        known.has(
          input
            .slice(i, k)
            .map((w) => w.surface)
            .join(''),
        )
      ) {
        j = k
        break
      }
    }
    if (j === null) {
      groups.push([input[i]!])
      i++
    } else {
      groups.push(input.slice(i, j))
      i = j
    }
  }
  const words = groups.map((g) => ({
    surface: g.map((w) => w.surface).join(''),
    hira: g.map((w) => w.hira).join(''),
    charType: g[0]!.charType,
  }))

  const out: Token[] = []
  for (const word of words) {
    const prev = out.at(-1)
    const roma = romajiWord(word)
    const tok: Token = { surface: roma, space: false }
    const s = word.surface
    // (substring checks are intentional: they mirror Python's `x in '...'`)
    if ('「『«'.includes(s) || '(['.includes(roma)) {
      if (prev) prev.space = true
    } else if ('」』»'.includes(s) || ']).,?!:'.includes(roma)) {
      if (prev) prev.space = false
      tok.space = true
    } else if (roma === ' ') {
      tok.space = false
    } else {
      tok.space = true
    }
    out.push(tok)
  }
  for (const t of out) t.surface = t.surface.replaceAll('っ', '')
  return out
}

export async function japaneseToPhonemes(text: string): Promise<string> {
  const [tk, known] = await Promise.all([loadTokenizer(), loadJaWords()])
  const words: Word[] = tk.tokenize(normalize(text)).flatMap((t): Word | Word[] => {
    const surface = t.surface_form
    const pron = t.pronunciation && t.pronunciation !== '*' ? t.pronunciation : undefined
    const reading = t.reading && t.reading !== '*' ? t.reading : undefined
    // MeCab splits runs like "?」" into separate symbols; kuromoji may not
    if (isSymbol(surface) && [...surface].length > 1) {
      return [...surface].map((c) => ({ surface: c, hira: c, charType: CT_SYMBOL }))
    }
    if (t.word_type === 'KNOWN') {
      return { surface, hira: kata2hira(pron ?? reading ?? surface), charType: CT_KANA }
    }
    if (isKana(surface)) return { surface, hira: kata2hira(surface), charType: CT_KANA }
    if (isSymbol(surface)) return { surface, hira: surface, charType: CT_SYMBOL }
    return { surface, hira: surface, charType: CT_OTHER }
  })
  const ps = toTokens(words, known)
    .map((t) => t.surface + (t.space ? ' ' : ''))
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .replaceAll('(', '«')
    .replaceAll(')', '»')
  return ps.replace(/(?<![!",.:;?»—…”]) (?=ʔ)|(?<=ʔ) (?!["«“])/g, '')
}

/** Hiragana reading of Japanese text, or null when some part (e.g. an unknown kanji) has none. */
export async function japaneseToKana(text: string): Promise<string | null> {
  const tk = await loadTokenizer()
  let out = ''
  for (const t of tk.tokenize(normalize(text))) {
    const surface = t.surface_form
    const reading = t.reading && t.reading !== '*' ? t.reading : undefined
    if (reading) out += kata2hira(reading)
    else if (isKana(surface)) out += kata2hira(surface)
    else if (/^[\s\p{P}\p{S}]+$/u.test(surface)) continue
    else return null
  }
  return out || null
}
