import type { DerivedRow, Lang, PosOption } from '@/db/types'
import { LANGS } from '@/db/defaults'

export interface ImportRow {
  word: string
  /** decided by the AI per word, else the deck's language */
  lang: Lang
  meaning: string
  /** pos option ids of the chosen language, over all senses */
  pos: string[]
  /** the meanings one by one, each with its own parts of speech */
  senses: { pos: string[]; meaning: string }[]
  examples: { sentence: string; translation: string; marks?: string[] }[]
  /** derived words on the picture, kept in the note as a table; made into cards by hand later */
  derived: DerivedRow[]
  /** pos texts that matched no option */
  unknownPos: string[]
}

export interface ImportResult {
  rows: ImportRow[]
  /** items skipped because the word or meaning was missing */
  skipped: number
}

const pick = (o: Record<string, unknown>, keys: string[]): unknown =>
  keys.map((k) => o[k]).find((v) => v !== undefined && v !== null)

const asText = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''

/** Match "n.", "名詞" or "名詞 n." against the option labels. */
export function matchPos(text: string, options: PosOption[]): PosOption | undefined {
  const t = text.trim().toLowerCase()
  if (!t) return undefined
  const label = (o: PosOption) => o.label.toLowerCase()
  const parts = (o: PosOption) => label(o).split(/\s+/)
  return (
    options.find((o) => o.id === text || label(o) === t) ??
    options.find((o) => parts(o).includes(t)) ??
    options.find((o) => parts(o).some((p) => p.replace(/\.$/, '') === t.replace(/\.$/, '')))
  )
}

const LANG_NAMES: Record<string, Lang> = {
  en: 'en',
  english: 'en',
  英文: 'en',
  英語: 'en',
  ja: 'ja',
  jp: 'ja',
  japanese: 'ja',
  日文: 'ja',
  日語: 'ja',
  ko: 'ko',
  kr: 'ko',
  korean: 'ko',
  韓文: 'ko',
  韓語: 'ko',
}

/** Parse the JSON an AI produced: an array of { word, lang, senses }, optionally in ``` fences. */
export function parseImport(
  text: string,
  posOf: (lang: Lang) => PosOption[],
  fallback: Lang,
): ImportResult {
  const body = text
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  const json: unknown = JSON.parse(body)
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object'
      ? Object.values(json).find(Array.isArray)
      : undefined
  if (!list) throw new Error('需要是陣列，例如 [{"word": "...", "meaning": "...", "pos": "..."}]')

  const rows: ImportRow[] = []
  let skipped = 0
  for (const item of list as unknown[]) {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const word = asText(pick(o, ['word', '單字']))
    const lang = LANG_NAMES[asText(pick(o, ['lang', 'language', '語言'])).toLowerCase()] ?? fallback
    const options = posOf(lang)
    const unknownPos: string[] = []
    // "pos" as a list or as text split on commas, matched against the options
    const toPos = (raw: unknown) => {
      const texts = (
        Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,，、;；/]/) : []
      )
        .map(asText)
        .filter(Boolean)
      const ids: string[] = []
      for (const p of texts) {
        const m = matchPos(p, options)
        if (!m) unknownPos.push(p)
        else if (!ids.includes(m.id)) ids.push(m.id)
      }
      return ids
    }
    // either a list of senses, or the single meaning and pos of the older format
    const rawSenses = pick(o, ['senses', '詞義'])
    const senses = (Array.isArray(rawSenses) ? rawSenses : [o]).flatMap((x) => {
      const sx = x && typeof x === 'object' ? (x as Record<string, unknown>) : {}
      const meaning = asText(pick(sx, ['meaning', '意思']))
      return meaning ? [{ pos: toPos(pick(sx, ['pos', '詞性'])), meaning }] : []
    })
    if (!word || !senses.length) {
      skipped++
      continue
    }
    const meaning = senses.map((x) => x.meaning).join('\n')
    const pos = [...new Set(senses.flatMap((x) => x.pos))]
    const rawEx = pick(o, ['examples', '例句'])
    const exList: unknown[] = Array.isArray(rawEx) ? rawEx : [o]
    const examples = exList.flatMap((e) => {
      if (typeof e === 'string') return e.trim() ? [{ sentence: e.trim(), translation: '' }] : []
      const x = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
      const sentence = asText(pick(x, ['sentence', 'example', '例句']))
      const translation = asText(pick(x, ['translation', '翻譯']))
      if (!sentence) return []
      const rawMarks = pick(x, ['marks', 'mark', '標記'])
      const marks = (Array.isArray(rawMarks) ? rawMarks : [rawMarks])
        .map(asText)
        .filter((m, i, a) => m && sentence.includes(m) && a.indexOf(m) === i)
      return [{ sentence, translation, ...(marks.length ? { marks } : {}) }]
    })
    const rawDer = pick(o, ['derived', '衍生字'])
    const derived = (Array.isArray(rawDer) ? rawDer : []).flatMap((d): DerivedRow[] => {
      const x = d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
      const dWord = asText(pick(x, ['word', '單字']))
      const dMeaning = asText(pick(x, ['meaning', '意思']))
      if (!dWord || !dMeaning) return []
      const rawPos = pick(x, ['pos', '詞性'])
      const dPos = (Array.isArray(rawPos) ? rawPos : [rawPos])
        .map(asText)
        .filter(Boolean)
        .map((p) => matchPos(p, options)?.label ?? p)
        .join('、')
      return [{ word: dWord, pos: dPos, meaning: dMeaning }]
    })
    rows.push({ word, lang, meaning, pos, senses, examples, derived, unknownPos })
  }
  return { rows, skipped }
}

export const importPrompt = (posOf: (lang: Lang) => PosOption[]) =>
  `請整理圖片中的單字，輸出成 JSON 陣列。只輸出 JSON，不要加任何說明文字。

## 格式
[
  {
    "word": "單字",
    "lang": "en",
    "senses": [
      { "pos": ["詞性"], "meaning": "繁體中文意思" }
    ],
    "examples": [
      {
        "sentence": "例句",
        "translation": "繁體中文翻譯",
        "marks": ["例句中的單字"]
      }
    ],
    "derived": [
      { "word": "衍生字", "pos": ["詞性"], "meaning": "繁體中文意思" }
    ]
  }
]

## 欄位說明
- word：必填。
- lang：必填，依單字判斷：英文 en、日文 ja、韓文 ko。
- senses：單字的各個意思，至少一個。同一個單字有不同詞性或不同意思時，各自一組，例如 run → [{ "pos": ["動詞"], "meaning": "跑" }, { "pos": ["名詞"], "meaning": "跑步" }]。
- senses 的 meaning：必填。
- senses 的 pos：依 lang 從下列選項選一個或多個，沒有就給空陣列。
${LANGS.map(
  (l) =>
    `  - ${l.id}：${posOf(l.id)
      .map((o) => o.label)
      .join('、')}`,
).join('\n')}
- examples：圖片上沒有例句或翻譯就省略或給空陣列，不要自己編造。
- marks：標出例句中對應該單字的字詞。
  - 必須是 sentence 裡原封不動出現的文字（大小寫、標點一致），不要多帶前後的詞。
  - 單字在例句中有變化（過去式、過去分詞、進行式、第三人稱單數、複數、比較級、動詞或形容詞活用等）時，標變化後的樣子。例：word 為 "run"、sentence 為 "He ran home." → ["ran"]。
  - 片語動詞被拆開時，各部分分別標。例："give up" → ["gave", "up"]。
  - 找不到對應的字詞就給空陣列。
- derived：圖片上該單字旁列出的衍生字（例如 happy 的 happiness、happily、unhappy）。
  - 只收圖片上有寫出來的，不要自己補；沒有就省略或給空陣列。
  - 每個衍生字都要有 word 和 meaning，pos 的選項與 senses 的 pos 相同，只選一個最貼切的。
  - 衍生字不要另外成為最外層的項目。`
