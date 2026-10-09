import type { BasicCard, Card, CardTemplate, Lang, SchedState, VocabCard } from '@/db/types'
import { langLabel } from '@/db/defaults'
import { uid } from './id'
import { emptySched, State } from './fsrs'

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

export const cardTitle = (c: Card) => (c.type === 'basic' ? plainText(c.front) : c.word.trim())

export const cardSubtitle = (c: Card) =>
  c.type === 'basic' ? plainText(c.back) : plainText(c.meaning)

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
