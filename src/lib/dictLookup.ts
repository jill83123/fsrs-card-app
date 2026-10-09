/*
 * Look a word up in online dictionaries to fill a vocab card quickly (all CORS-enabled):
 *  - ja / ko: Chinese Wiktionary (Traditional variant) — Chinese senses, parts of speech, examples.
 *  - en: Google Translate's unofficial dictionary endpoint for Chinese senses and parts of speech,
 *    English Wiktionary for example sentences.
 *  - fallback for every language: English Wiktionary glosses translated by MyMemory.
 * Every source can fail, so each failure is reported in `warnings` for the UI to show.
 */
import type { Example, Lang } from '@/db/types'
import { DEFAULT_POS } from '@/db/defaults'
import { uid } from '@/lib/id'

export interface DictResult {
  /** one line per sense */
  meaning: string
  /** default part-of-speech ids */
  pos: string[]
  examples: Example[]
  /** sources that failed or fell back to a weaker one */
  warnings: string[]
}
type Found = Omit<DictResult, 'warnings'>

interface WikiExample {
  example?: string
  translation?: string
  transliteration?: string
}
interface WikiDefinition {
  definition?: string
  parsedExamples?: WikiExample[]
}
interface WikiEntry {
  partOfSpeech: string
  language: string
  definitions: WikiDefinition[]
}

const MAX_SENSES = 3
const MAX_EXAMPLES = 2
const NET = '請確認網路連線'
const JUNK_GLOSS =
  /language code|ISO 639|^(alternative|obsolete|archaic|dated|rare|nonstandard|misspelling).*(of|form)|^(initialism|abbreviation|acronym|contraction) of|^(the )?letter|^symbol/i

/** Keep only the first clause of a gloss so the card stays short. */
function shorten(text: string): string {
  let t = text
  // drop parenthetical notes such as "(e.g. …)" before cutting at the first clause
  for (let prev = ''; prev !== t;) {
    prev = t
    t = t.replace(/\([^()]*\)/g, '')
  }
  const first = t
    .split(/[;.]/)[0]!
    .replace(/\s+/g, ' ')
    .replace(/[\s,:]+$/, '')
  return first.length > 50 ? first.slice(0, 50).replace(/\s+\S*$/, '') : first
}

function plain(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('rt, rp, style, sup').forEach((n) => n.remove())
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// ---------- English Wiktionary + MyMemory (fallback / examples) ----------

async function fetchEntries(word: string, lang: Lang): Promise<WikiEntry[]> {
  const get = async (w: string) => {
    const res = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w)}`,
    )
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`wiktionary ${res.status}`)
    return ((await res.json()) as Record<string, WikiEntry[]>)[lang] ?? null
  }
  const w = word.trim()
  const found =
    (await get(w)) ?? (lang === 'en' && w !== w.toLowerCase() ? await get(w.toLowerCase()) : null)
  return found ?? []
}

/** English → Traditional Chinese; returns null when the service has no usable answer. */
async function translate(text: string): Promise<string | null> {
  const q = text.slice(0, 450)
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-TW`,
    )
    if (!res.ok) return null
    const j = (await res.json()) as {
      responseStatus?: number | string
      responseData?: { translatedText?: string }
    }
    const t = j.responseData?.translatedText?.trim()
    if (Number(j.responseStatus) !== 200 || !t || /MYMEMORY|QUERY LENGTH/i.test(t)) return null
    return t
  } catch {
    return null
  }
}

/** Map an English Wiktionary part-of-speech heading to one of the default ids of that language. */
function mapPos(lang: Lang, heading: string, word: string): string | null {
  const h = heading.toLowerCase()
  const id = (n: number) => DEFAULT_POS[lang][n]?.id ?? null
  if (lang === 'en') {
    const table: Record<string, number> = {
      noun: 0,
      'proper noun': 0,
      verb: 1,
      adjective: 2,
      adverb: 3,
      pronoun: 4,
      preposition: 5,
      conjunction: 6,
      interjection: 7,
      phrase: 8,
      proverb: 8,
      'phrasal verb': 9,
    }
    return h in table ? id(table[h]!) : null
  }
  if (lang === 'ja') {
    if (h === 'noun' || h === 'proper noun') return id(0)
    if (h === 'verb') return /する$/.test(word) ? id(3) : /^(来る|くる)$/.test(word) ? id(4) : null
    if (h === 'adjective') return /い$/.test(word) ? id(5) : id(6)
    const table: Record<string, number> = {
      adverb: 7,
      particle: 8,
      conjunction: 9,
      interjection: 10,
      phrase: 12,
      proverb: 12,
    }
    return h in table ? id(table[h]!) : null
  }
  const table: Record<string, number> = {
    noun: 0,
    'proper noun': 0,
    verb: 1,
    adjective: 2,
    adverb: 3,
    pronoun: 4,
    particle: 5,
    determiner: 6,
    interjection: 7,
    numeral: 8,
    phrase: 9,
    proverb: 9,
  }
  return h in table ? id(table[h]!) : null
}

/** Parse English Wiktionary entries into glosses, part-of-speech ids and examples. */
function parseEnglishWiki(entries: WikiEntry[], lang: Lang, w: string) {
  const pos: string[] = []
  const glosses: string[] = []
  const exSources: { sentence: string; english: string }[] = []
  for (const e of entries) {
    const p = mapPos(lang, e.partOfSpeech, w)
    if (p && !pos.includes(p)) pos.push(p)
    // English entries with no matching part of speech are symbols, letters, codes…
    if (lang === 'en' && !p) continue
    for (const d of e.definitions) {
      const text = plain(d.definition ?? '')
      const gloss = shorten(text)
      if (
        gloss &&
        !JUNK_GLOSS.test(text) &&
        !glosses.includes(gloss) &&
        glosses.length < MAX_SENSES
      )
        glosses.push(gloss)
      for (const x of d.parsedExamples ?? []) {
        const sentence = plain(x.example ?? '')
        if (!sentence || exSources.length >= MAX_EXAMPLES) continue
        const english = plain(x.translation ?? '')
        // some entries put the romanization where the English translation should be
        const romaji = english === plain(x.transliteration ?? '') || /[āēīōū]/i.test(english)
        exSources.push({ sentence, english: romaji ? '' : english })
      }
    }
  }
  return { pos: pos.slice(0, 2), glosses, exSources }
}

/** Last-resort pipeline: English Wiktionary glosses translated by MyMemory. */
async function viaEnglishWiktionary(w: string, lang: Lang): Promise<Found | null> {
  const { pos, glosses, exSources } = parseEnglishWiki(await fetchEntries(w, lang), lang, w)
  if (!glosses.length) return null
  const [zhGlosses, zhExamples] = await Promise.all([
    Promise.all(glosses.map(translate)),
    Promise.all(
      exSources.map((x) =>
        lang === 'en' ? translate(x.sentence) : x.english ? translate(x.english) : null,
      ),
    ),
  ])
  return {
    meaning: glosses
      .map((g, i) => {
        const zh = zhGlosses[i]
        if (!zh || zh === g) return g
        return lang === 'ja' ? zh : `${zh}（${g}）`
      })
      .join('\n'),
    pos,
    examples: exSources.map((x, i) => ({
      id: uid(),
      sentence: x.sentence,
      translation: zhExamples[i] ?? x.english,
    })),
  }
}

// ---------- Google Translate (English → Traditional Chinese) ----------

const gtxUrl = (sl: Lang) =>
  `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=zh-TW&dt=t`

type GtxData = [[string, ...unknown[]][], [string, string[], [string, string[]][]][] | null]

/** Translate several English texts in one request. Returns null when the service fails. */
async function gtxTranslate(texts: string[]): Promise<string[] | null> {
  if (!texts.length) return []
  try {
    const clean = texts.map((t) => t.replace(/\s*\n\s*/g, ' ').trim())
    const res = await fetch(`${gtxUrl('en')}&q=${encodeURIComponent(clean.join('\n'))}`)
    if (!res.ok) return null
    const d = (await res.json()) as GtxData
    const out = d[0]
      .map((x) => x[0])
      .join('')
      .split('\n')
      .map((x) => x.trim())
    return out.length === texts.length ? out : null
  } catch {
    return null
  }
}

/** Translate with Google first, MyMemory per text second; empty string when both fail. */
async function translateMany(texts: string[]): Promise<string[]> {
  const g = await gtxTranslate(texts)
  if (g) return g
  return Promise.all(texts.map(async (t) => (await translate(t)) ?? ''))
}

const EN_POS_NAMES: Record<string, number> = {
  noun: 0,
  verb: 1,
  adjective: 2,
  adverb: 3,
  pronoun: 4,
  preposition: 5,
  conjunction: 6,
  exclamation: 7,
  interjection: 7,
}

/** Chinese senses by part of speech from Google's dictionary data. Throws when the service is down. */
async function googleDict(w: string): Promise<{ lines: string[]; pos: string[] } | null> {
  const res = await fetch(`${gtxUrl('en')}&dt=bd&q=${encodeURIComponent(w)}`)
  if (!res.ok) throw new Error(`google ${res.status}`)
  const d = (await res.json()) as GtxData
  const main = d[0]
    .map((x) => x[0])
    .join('')
    .trim()
  const lines: string[] = []
  const pos: string[] = []
  const key = w.toLowerCase()
  for (const [name, , detail] of d[1] ?? []) {
    // keep multi-character words whose reverse translations include the query itself
    const words = detail
      .filter(([zh, back]) => [...zh].length >= 2 && back.some((b) => b.toLowerCase() === key))
      .map(([zh]) => zh)
    if (!words.length || lines.length >= 3) continue
    lines.push(words.slice(0, 3).join('；'))
    const n = EN_POS_NAMES[name.toLowerCase()]
    const id = n === undefined ? null : DEFAULT_POS.en[n]?.id
    if (id && !pos.includes(id)) pos.push(id)
  }
  if (main && main.toLowerCase() !== key && !lines.some((l) => l.split('；').includes(main)))
    lines.unshift(main)
  return lines.length ? { lines: lines.slice(0, 4), pos } : null
}

async function lookupEnglish(w: string, warnings: string[]): Promise<Found | null> {
  const [g, wk] = await Promise.allSettled([googleDict(w), fetchEntries(w, 'en')])
  const wiki = wk.status === 'fulfilled' ? parseEnglishWiki(wk.value, 'en', w) : null
  if (wk.status === 'rejected') warnings.push(`英文 Wiktionary 無法使用，沒有取得例句（${NET}）`)

  if (g.status === 'fulfilled' && g.value) {
    const pos = [...g.value.pos]
    for (const p of wiki?.pos ?? []) if (!pos.includes(p)) pos.push(p)
    const sources = wiki?.exSources ?? []
    const zh = await translateMany(sources.map((x) => x.sentence))
    return {
      meaning: g.value.lines.join('\n'),
      pos: pos.slice(0, 2),
      examples: sources.map((x, i) => ({ id: uid(), sentence: x.sentence, translation: zh[i]! })),
    }
  }
  if (g.status === 'rejected') warnings.push(`Google 翻譯無法使用，改用備用來源（${NET}）`)
  else if (!wiki?.glosses.length) return null
  else warnings.push('Google 翻譯沒有這個字，改用備用來源')

  if (wk.status === 'rejected') throw new Error('all sources failed')
  const fallback = await viaEnglishWiktionary(w, 'en').catch(() => null)
  if (fallback) warnings.push('意思由英文字典＋機器翻譯產生，可能較不精準')
  return fallback
}

/** Plain machine translation of a Japanese / Korean word; null when Google has nothing. */
async function googleDirect(w: string, lang: 'ja' | 'ko'): Promise<string | null> {
  const res = await fetch(`${gtxUrl(lang)}&q=${encodeURIComponent(w)}`)
  if (!res.ok) throw new Error(`google ${res.status}`)
  const d = (await res.json()) as GtxData
  const t = d[0]
    .map((x) => x[0])
    .join('')
    .trim()
  return t && t !== w ? t : null
}

// ---------- Chinese Wiktionary (ja / ko) ----------

const ZH_LANG_HEADING: Record<'ja' | 'ko', RegExp> = {
  ja: /^日(本)?語$/,
  ko: /^(朝鮮語|韓語|韓國語|韓文|朝鮮文)$/,
}
const ZH_SKIP_HEADING =
  /詞源|發音|參見|參考|衍生|派生|相關|翻譯|近義|反義|活用|變格|延伸|用法|字源|同義/
const ZH_BRACKET_POS: Record<string, string> = {
  名: '名詞',
  動: '動詞',
  形: '形容詞',
  副: '副詞',
  代: '代詞',
  助: '助詞',
  冠: '冠形詞',
  感: '感嘆詞',
  數: '數詞',
}

function mapZhPos(lang: 'ja' | 'ko', heading: string, headline: string, word: string) {
  const id = (n: number) => (n < 0 ? null : (DEFAULT_POS[lang][n]?.id ?? null))
  const h = heading.replace(/\s/g, '')
  const pick = (table: [RegExp, number][]) => id(table.find(([re]) => re.test(h))?.[1] ?? -1)
  if (lang === 'ja') {
    if (/名詞/.test(h)) return id(0)
    if (/形容動詞/.test(h)) return id(6)
    if (/形容詞/.test(h)) return id(5)
    if (/動詞/.test(h)) {
      if (/サ[變变]|する/.test(headline) || /する$/.test(word)) return id(3)
      if (/カ[變变]/.test(headline)) return id(4)
      if (/一段/.test(headline)) return id(2)
      if (/五段/.test(headline)) return id(1)
      return null
    }
    return pick([
      [/副詞/, 7],
      [/助詞/, 8],
      [/接續詞|連詞/, 9],
      [/感嘆詞|嘆詞/, 10],
      [/連體詞/, 11],
      [/慣用語|諺語|成語|短語|片語/, 12],
    ])
  }
  return pick([
    [/名詞/, 0],
    [/形容詞/, 2],
    [/動詞/, 1],
    [/副詞/, 3],
    [/代詞|代名詞/, 4],
    [/助詞/, 5],
    [/冠形詞|冠詞|定語/, 6],
    [/感嘆詞|嘆詞/, 7],
    [/數詞/, 8],
    [/慣用語|短語|成語/, 9],
  ])
}

const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

function stripRuby(el: Element): Element {
  const c = el.cloneNode(true) as Element
  c.querySelectorAll('rt, rp, style, sup').forEach((n) => n.remove())
  return c
}

/** Examples inside one <li>: Japanese ones nest romaji + translation, Korean ones use "문장　　翻譯". */
function zhExamples(li: Element): { sentence: string; translation: string }[] {
  const c = stripRuby(li)
  c.querySelectorAll('ul, ol').forEach((n) => n.remove())
  const out: { sentence: string; translation: string }[] = []
  for (const dd of c.querySelectorAll('dd')) {
    const span = dd.querySelector(':scope > span[lang]')
    if (span && span.getAttribute('lang') !== 'la') {
      const inner = dd.querySelectorAll(':scope > dl > dd')
      const last = inner[inner.length - 1]
      out.push({ sentence: textOf(span), translation: last ? textOf(last) : '' })
    } else if (!dd.querySelector('dl')) {
      const [sentence, ...rest] = (dd.textContent ?? '').split(/　{2,}/)
      if (rest.length && /[가-힣]/.test(sentence!))
        out.push({ sentence: sentence!.trim(), translation: rest.join(' ').trim() })
    }
  }
  return out.filter((x) => x.sentence)
}

/** Null when the page or the language section does not exist. Throws when the service is down. */
async function zhWiktionary(w: string, lang: 'ja' | 'ko'): Promise<Found | null> {
  const res = await fetch(
    `https://zh.wiktionary.org/w/api.php?action=parse&prop=text&format=json&formatversion=2&origin=*&disableeditsection=1&redirects=1&uselang=zh-hant&page=${encodeURIComponent(w)}`,
  )
  if (!res.ok) throw new Error(`zh.wiktionary ${res.status}`)
  const j = (await res.json()) as { error?: { code?: string }; parse?: { text?: string } }
  if (j.error?.code === 'missingtitle') return null
  if (j.error || !j.parse?.text) throw new Error('zh.wiktionary error')

  const doc = new DOMParser().parseFromString(j.parse.text, 'text/html')
  const root = doc.querySelector('.mw-parser-output') ?? doc.body
  let inLang = false
  let heading = ''
  let headline = ''
  const pos: string[] = []
  const senses: string[] = []
  const examples: { sentence: string; translation: string }[] = []
  for (const el of root.children) {
    const h = el.matches('h2, h3, h4, h5')
      ? el
      : el.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > h5')
    if (h) {
      heading = textOf(h)
      if (h.tagName === 'H2') inLang = ZH_LANG_HEADING[lang].test(heading)
      headline = ''
      continue
    }
    if (!inLang) continue
    if (el.tagName === 'P' && !headline) headline = textOf(el)
    if (el.tagName !== 'OL' || ZH_SKIP_HEADING.test(heading)) continue

    const bracket = /〔([^〕])/.exec(headline)?.[1]
    const label = (bracket && ZH_BRACKET_POS[bracket]) || heading
    const p = mapZhPos(lang, label, headline, w)
    if (p && !pos.includes(p)) pos.push(p)
    for (const li of el.querySelectorAll(':scope > li')) {
      const c = stripRuby(li)
      c.querySelectorAll('dl, ul, ol').forEach((n) => n.remove())
      const def = textOf(c)
      if (def && senses.length < 4) senses.push(def)
      for (const x of zhExamples(li)) if (examples.length < MAX_EXAMPLES) examples.push(x)
    }
  }
  if (!senses.length) return null
  return {
    meaning: senses.join('\n'),
    pos: pos.slice(0, 2),
    examples: examples.map((x) => ({ id: uid(), ...x })),
  }
}

/**
 * Returns null when no source knows the word. Throws only when every source is unreachable;
 * partial failures are listed in `warnings`.
 */
export async function lookupWord(word: string, lang: Lang): Promise<DictResult | null> {
  const w = word.trim()
  const warnings: string[] = []
  let result: Found | null = null

  if (lang === 'en') {
    result = await lookupEnglish(w, warnings)
  } else {
    let reason = ''
    try {
      result = await zhWiktionary(w, lang)
      if (!result) reason = '中文版 Wiktionary 沒有這個字或無法解析頁面'
    } catch {
      reason = `中文版 Wiktionary 無法使用（${NET}）`
    }
    if (!result) {
      const [g, e] = await Promise.allSettled([
        googleDirect(w, lang),
        viaEnglishWiktionary(w, lang),
      ])
      const google = g.status === 'fulfilled' ? g.value : null
      const english = e.status === 'fulfilled' ? e.value : null
      if (g.status === 'rejected' && e.status === 'rejected' && reason.includes(NET))
        throw new Error('all sources failed')
      if (google || english) {
        // machine translation often repeats a word ("學習，學習，學習"): collapse it
        const lines = (english?.meaning ?? '')
          .split('\n')
          .filter(Boolean)
          .map((l) => [...new Set(l.split('，'))].join('，'))
        if (google && !lines.includes(google)) lines.unshift(google)
        result = {
          meaning: lines.join('\n'),
          pos: english?.pos ?? [],
          examples: english?.examples ?? [],
        }
        warnings.push(`${reason}，改用備用來源（Google 翻譯＋英文字典，為機器翻譯，可能較不精準）`)
      }
    }
  }
  return result ? { ...result, warnings } : null
}

/** Translate one sentence into Traditional Chinese; empty string when the service fails. */
export async function translateSentence(text: string, lang: Lang): Promise<string> {
  const t = text.replace(/\s*\n\s*/g, ' ').trim()
  if (!t) return ''
  try {
    const res = await fetch(`${gtxUrl(lang)}&q=${encodeURIComponent(t)}`)
    if (res.ok) {
      const d = (await res.json()) as GtxData
      const out = d[0]
        .map((x) => x[0])
        .join('')
        .trim()
      if (out) return out
    }
  } catch {
    /* fall through to MyMemory */
  }
  return lang === 'en' ? ((await translate(t)) ?? '') : ''
}
