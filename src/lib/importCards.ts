import type { Lang, PosOption } from '@/db/types'

export interface ImportRow {
  word: string
  meaning: string
  /** pos option ids of the chosen language */
  pos: string[]
  examples: { sentence: string; translation: string; marks?: string[] }[]
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
function matchPos(text: string, options: PosOption[]): PosOption | undefined {
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

/** Parse the JSON an AI produced: an array of { word, meaning, pos }, optionally in ``` fences. */
export function parseImport(text: string, options: PosOption[]): ImportResult {
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
    const meaning = asText(pick(o, ['meaning', '意思']))
    if (!word || !meaning) {
      skipped++
      continue
    }
    const rawPos = pick(o, ['pos', '詞性'])
    const texts = (
      Array.isArray(rawPos) ? rawPos : typeof rawPos === 'string' ? rawPos.split(/[,，、;；/]/) : []
    )
      .map(asText)
      .filter(Boolean)
    const pos: string[] = []
    const unknownPos: string[] = []
    for (const p of texts) {
      const m = matchPos(p, options)
      if (!m) unknownPos.push(p)
      else if (!pos.includes(m.id)) pos.push(m.id)
    }
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
    rows.push({ word, meaning, pos, examples, unknownPos })
  }
  return { rows, skipped }
}

export const importPrompt = (lang: Lang, options: PosOption[]) =>
  `請整理圖片中的${{ en: '英文', ja: '日文', ko: '韓文' }[lang]}單字，輸出成 JSON 陣列。只輸出 JSON，不要加任何說明文字。

## 格式
[
  {
    "word": "單字",
    "meaning": "繁體中文意思",
    "pos": ["詞性"],
    "examples": [
      {
        "sentence": "例句",
        "translation": "繁體中文翻譯",
        "marks": ["例句中的單字"]
      }
    ]
  }
]

## 欄位說明
- word、meaning：必填。
- pos：從這些選項選一個或多個，沒有就給空陣列：${options.map((o) => o.label).join('、')}
- examples：圖片上沒有例句或翻譯就省略或給空陣列，不要自己編造。
- marks：標出例句中對應該單字的字詞。
  - 必須是 sentence 裡原封不動出現的文字（大小寫、標點一致），不要多帶前後的詞。
  - 單字在例句中有變化（過去式、過去分詞、進行式、第三人稱單數、複數、比較級、動詞或形容詞活用等）時，標變化後的樣子。例：word 為 "run"、sentence 為 "He ran home." → ["ran"]。
  - 片語動詞被拆開時，各部分分別標。例："give up" → ["gave", "up"]。
  - 找不到對應的字詞就給空陣列。`
