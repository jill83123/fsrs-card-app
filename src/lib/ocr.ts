import type { Lang } from '@/db/types'

const TESS_LANG: Record<Lang, string> = { en: 'eng', ja: 'jpn', ko: 'kor' }

export interface OcrProgress {
  status: string
  progress: number
}

export async function recognize(image: Blob, lang: Lang, onProgress?: (p: OcrProgress) => void) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(TESS_LANG[lang], 1, {
    logger: (m: { status: string; progress: number }) =>
      onProgress?.({ status: m.status, progress: m.progress }),
  })
  try {
    const { data } = await worker.recognize(image)
    return cleanText(data.text, lang)
  } finally {
    await worker.terminate()
  }
}

const CJK = '\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af\\uff66-\\uff9f'

/** Tesseract puts spaces between CJK characters; remove them for Japanese. */
function cleanText(text: string, lang: Lang) {
  let t = text.replace(/\r/g, '')
  if (lang === 'ja') t = t.replace(new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, 'g'), '$1')
  return t.replace(/[ \t]+\n/g, '\n').trim()
}

/** Split recognised text into candidate words, de-duplicated in reading order. */
export function extractWords(text: string, lang: Lang): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (w: string) => {
    const k = lang === 'en' ? w.toLowerCase() : w
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  if (lang === 'en') {
    for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/g))
      push(m[0].replace(/’/g, "'"))
    return out
  }
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(lang, { granularity: 'word' })
    for (const s of seg.segment(text))
      if (s.isWordLike && /\p{L}/u.test(s.segment)) push(s.segment.trim())
    return out
  }
  for (const w of text.split(/[\s\p{P}]+/u)) push(w.trim())
  return out
}
