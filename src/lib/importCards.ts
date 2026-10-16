import type { Lang, PosOption } from '@/db/types'

export interface ImportRow {
  word: string
  meaning: string
  /** pos option ids of the chosen language */
  pos: string[]
  examples: { sentence: string; translation: string }[]
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
      return sentence ? [{ sentence, translation }] : []
    })
    rows.push({ word, meaning, pos, examples, unknownPos })
  }
  return { rows, skipped }
}

export const importPrompt = (lang: Lang, options: PosOption[]) =>
  `請整理圖片中的單字，輸出成 JSON 陣列（只輸出 JSON，不要其他說明）：
[{"word": "單字", "meaning": "繁體中文意思", "pos": ["詞性"], "examples": [{"sentence": "例句", "translation": "繁體中文翻譯"}]}]
圖片上沒有例句或翻譯的欄位就省略或給空陣列，不要自己編造
詞性請從這些選項擇一或多個（沒有就給空陣列）：${options.map((o) => o.label).join('、')}
語言：${{ en: '英文', ja: '日文', ko: '韓文' }[lang]}`
