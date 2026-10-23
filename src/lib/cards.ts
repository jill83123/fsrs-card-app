import type { BasicCard, Card, CardTemplate, Lang, SchedState, Sense, VocabCard } from '@/db/types'
import { LANGS, langLabel } from '@/db/defaults'
import { uid } from './id'
import { emptySched, State } from './fsrs'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// common irregular verbs: base → past and participle forms
const EN_IRREGULAR: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  have: ['has', 'had', 'having'],
  do: ['does', 'did', 'done'],
  go: ['goes', 'went', 'gone'],
  see: ['saw', 'seen'],
  take: ['took', 'taken'],
  make: ['made'],
  come: ['came'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  run: ['ran'],
  eat: ['ate', 'eaten'],
  write: ['wrote', 'written'],
  buy: ['bought'],
  bring: ['brought'],
  think: ['thought'],
  say: ['said'],
  tell: ['told'],
  know: ['knew', 'known'],
  find: ['found'],
  leave: ['left'],
  feel: ['felt'],
  keep: ['kept'],
  begin: ['began', 'begun'],
  speak: ['spoke', 'spoken'],
  choose: ['chose', 'chosen'],
  break: ['broke', 'broken'],
  drive: ['drove', 'driven'],
  sing: ['sang', 'sung'],
  swim: ['swam', 'swum'],
  sit: ['sat'],
  stand: ['stood'],
  teach: ['taught'],
  catch: ['caught'],
  forget: ['forgot', 'forgotten'],
  understand: ['understood'],
}

/** The word and the forms an English word can take in a sentence (-s, -ed, -ing, irregular ones). */
function enForms(word: string): string[] {
  const w = word.toLowerCase()
  const forms = new Set([w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`])
  if (w.endsWith('e')) forms.add(`${w.slice(0, -1)}ing`)
  if (/[^aeiou]y$/.test(w)) {
    forms.add(`${w.slice(0, -1)}ies`)
    forms.add(`${w.slice(0, -1)}ied`)
    forms.add(`${w.slice(0, -1)}ier`)
    forms.add(`${w.slice(0, -1)}iest`)
  }
  forms.add(`${w}er`)
  forms.add(`${w}est`)
  // a doubled last consonant: stop → stopped, stopping
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
    forms.add(`${w}${w.slice(-1)}ed`)
    forms.add(`${w}${w.slice(-1)}ing`)
  }
  for (const f of EN_IRREGULAR[w] ?? []) forms.add(f)
  return [...forms].sort((a, b) => b.length - a.length)
}

/** What a Japanese or Korean word keeps when it is conjugated (食べる → 食べ, 勉強する → 勉強, 읽다 → 읽). */
function stemsOf(word: string, lang: Lang): string[] {
  const stems: string[] = []
  if (lang === 'ja') {
    if (word.endsWith('する')) stems.push(word.slice(0, -2))
    if (/[るうくぐすつぬぶむい]$/.test(word)) stems.push(word.slice(0, -1))
    // a single kana would match almost anything
    return stems.filter((s) => s.length >= 2 || /[一-鿿]/.test(s))
  }
  if (lang === 'ko' && word.endsWith('다') && word.length > 1) stems.push(word.slice(0, -1))
  return stems
}

/**
 * The text of `word` inside a sentence, or undefined: the word itself (as a whole word for en),
 * else a conjugated form of it (en: ran / studies, ja: 食べ in 食べます, ko: 읽 in 읽어요).
 */
export function findWordMark(word: string, lang: Lang, sentence: string): string | undefined {
  const w = word.trim()
  if (!w) return undefined
  if (lang === 'en') {
    const exact = new RegExp(`(?<![A-Za-z])${escapeRe(w)}(?![A-Za-z])`, 'i').exec(sentence)?.[0]
    if (exact) return exact
    // a phrase inflects on its first word: give up → gave up
    const [first = '', ...rest] = w.split(/\s+/)
    const head = enForms(first).map(escapeRe).join('|')
    const tail = rest.map((t) => `\\s+${escapeRe(t)}`).join('')
    return new RegExp(`(?<![A-Za-z])(?:${head})${tail}(?![A-Za-z])`, 'i').exec(sentence)?.[0]
  }
  if (sentence.includes(w)) return w
  return stemsOf(w, lang).find((s) => sentence.includes(s))
}

export const templateLabel = (t?: CardTemplate) =>
  !t || t.type === 'basic'
    ? '正反卡'
    : t.lang
      ? `單字卡（${langLabel(t.lang)}）`
      : '單字卡（沿用上次的語言）'

export function isComplete(c: Card): boolean {
  if (c.type === 'basic') return c.front.trim() !== '' && c.back.trim() !== ''
  return c.word.trim() !== '' && c.meaning.trim() !== ''
}

/** Card eligible for scheduled study (review / learn). */
export const isStudyable = (c: Card) => !c.deleted && !c.suspended && isComplete(c)

export type Side = 'f' | 'r'

/** Only vocab cards have a reverse side. */
export const canReverse = (c: Card) => c.type === 'vocab'

/** Schedule of one side; a reverse side that was never reviewed is a new card. */
export const schedOf = (c: Card, side: Side): SchedState =>
  side === 'r' ? (c.rsched ?? emptySched(c.createdAt)) : c.sched

/** Queue key of one side of a card: the card id, plus ':r' for the reverse side. */
export const sideKey = (id: string, side: Side) => (side === 'r' ? `${id}:r` : id)
export const parseKey = (key: string): { id: string; side: Side } =>
  key.endsWith(':r') ? { id: key.slice(0, -2), side: 'r' } : { id: key, side: 'f' }

/**
 * Sides of a card that take part in scheduled study. The reverse side only starts once the
 * forward side has graduated to review, so a word is never learned in both directions at once.
 */
export function activeSides(c: Card, reverseOn: boolean): Side[] {
  if (!reverseOn || !canReverse(c)) return ['f']
  const started = c.rsched && c.rsched.state !== State.New
  return started || c.sched.state === State.Review ? ['f', 'r'] : ['f']
}

export const isLearned = (c: Card) => c.sched.state !== State.New || c.sched.reps > 0

/** Strip the most common markdown so card titles read cleanly in lists. */
export function plainText(md: string): string {
  return md
    .replace(/\|\|(.+?)\|\|/g, '▒▒▒')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_~>#]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The meanings of a vocab card: its saved list, or the one meaning and parts of speech of an older card. */
export function sensesOf(c: VocabCard): Sense[] {
  if (c.senses?.length) return c.senses
  return c.meaning.trim() || c.pos.length
    ? [{ id: `${c.id}-0`, pos: c.pos, meaning: c.meaning }]
    : []
}

/** Set the meanings, and keep `meaning` and `pos` (read by lists, search and spelling) in step with them. */
export function applySenses(c: VocabCard, senses: Sense[]) {
  const kept = senses
    .map((s) => ({ ...s, meaning: s.meaning.trim() }))
    .filter((s) => s.meaning || s.pos.length)
  c.senses = kept
  c.meaning = kept
    .map((s) => s.meaning)
    .filter(Boolean)
    .join('\n')
  c.pos = [...new Set(kept.flatMap((s) => s.pos))]
}

/** Short tag of a card's kind: its language for a vocab card (EN, JA, KO), QA for a basic one. */
export const typeBadge = (c: Card) =>
  c.type === 'vocab' ? (LANGS.find((l) => l.id === c.lang)?.short ?? '') : 'QA'

export const cardTitle = (c: Card) => (c.type === 'basic' ? plainText(c.front) : c.word.trim())

export const cardSubtitle = (c: Card) =>
  c.type === 'basic'
    ? plainText(c.back)
    : c.meaning.split('\n').map(plainText).filter(Boolean).join('；')

export function newBasicCard(deckId: string): BasicCard {
  const now = Date.now()
  return {
    id: uid(),
    type: 'basic',
    deckId,
    front: '',
    back: '',
    starred: false,
    suspended: false,
    sched: emptySched(now),
    createdAt: now,
    updatedAt: now,
  }
}

export function newVocabCard(deckId: string, lang: Lang, word = ''): VocabCard {
  const now = Date.now()
  return {
    id: uid(),
    type: 'vocab',
    deckId,
    lang,
    word,
    reading: '',
    meaning: '',
    pos: [],
    examples: [],
    note: '',
    starred: false,
    suspended: false,
    sched: emptySched(now),
    createdAt: now,
    updatedAt: now,
  }
}
