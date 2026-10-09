import type { FSRS } from 'ts-fsrs'
import type { Card, Lang } from '@/db/types'
import { cardSubtitle, cardTitle, isComplete, isLearned } from './cards'
import { retrievability, State } from './fsrs'

export type TriState = 'any' | 'yes' | 'no'
export type FamBucket = 'any' | 'new' | 'low' | 'mid' | 'high' | 'top'
export type SortKey = 'created' | 'updated' | 'due' | 'familiarity' | 'alpha'

export interface CardFilter {
  q: string
  type: 'any' | 'basic' | 'vocab'
  lang: 'any' | Lang
  starred: TriState
  suspended: TriState
  learned: TriState
  draft: TriState
  states: State[]
  fam: FamBucket
  sort: SortKey
  desc: boolean
}

export const defaultFilter = (): CardFilter => ({
  q: '',
  type: 'any',
  lang: 'any',
  starred: 'any',
  suspended: 'any',
  learned: 'any',
  draft: 'any',
  states: [],
  fam: 'any',
  sort: 'created',
  desc: true,
})

export const FAM_BUCKETS: { value: FamBucket; label: string }[] = [
  { value: 'any', label: '全部' },
  { value: 'new', label: '未學習' },
  { value: 'low', label: '< 50%' },
  { value: 'mid', label: '50–80%' },
  { value: 'high', label: '80–95%' },
  { value: 'top', label: '≥ 95%' },
]

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'created', label: '建立時間' },
  { value: 'updated', label: '更新時間' },
  { value: 'due', label: '到期日' },
  { value: 'familiarity', label: '熟悉度' },
  { value: 'alpha', label: '正面文字' },
]

const tri = (t: TriState, v: boolean) => t === 'any' || (t === 'yes') === v

export function activeFilterCount(f: CardFilter) {
  const d = defaultFilter()
  let n = 0
  for (const k of ['type', 'lang', 'starred', 'suspended', 'learned', 'draft', 'fam'] as const) {
    if (f[k] !== d[k]) n++
  }
  if (f.states.length) n++
  return n
}

export function applyFilter(cards: Card[], f: CardFilter, fsrs: FSRS, now = Date.now()) {
  const q = f.q.trim().toLowerCase()
  const famOf = new Map<string, number | null>()
  const fam = (c: Card) => {
    if (!famOf.has(c.id)) famOf.set(c.id, retrievability(fsrs, c.sched, now))
    return famOf.get(c.id)!
  }
  const out = cards.filter((c) => {
    if (f.type !== 'any' && c.type !== f.type) return false
    if (f.lang !== 'any' && (c.type !== 'vocab' || c.lang !== f.lang)) return false
    if (!tri(f.starred, c.starred)) return false
    if (!tri(f.suspended, c.suspended)) return false
    if (!tri(f.learned, isLearned(c))) return false
    if (!tri(f.draft, !isComplete(c))) return false
    if (f.states.length && !f.states.includes(c.sched.state)) return false
    if (f.fam !== 'any') {
      const r = fam(c)
      if (f.fam === 'new') {
        if (r !== null) return false
      } else {
        if (r === null) return false
        const p = r * 100
        if (f.fam === 'low' && p >= 50) return false
        if (f.fam === 'mid' && (p < 50 || p >= 80)) return false
        if (f.fam === 'high' && (p < 80 || p >= 95)) return false
        if (f.fam === 'top' && p < 95) return false
      }
    }
    if (q) {
      const hay = [cardTitle(c), cardSubtitle(c), c.type === 'vocab' ? c.reading : '']
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const dir = f.desc ? -1 : 1
  const key = (c: Card): number | string => {
    switch (f.sort) {
      case 'created':
        return c.createdAt
      case 'updated':
        return c.updatedAt
      case 'due':
        return c.sched.state === State.New ? Number.MAX_SAFE_INTEGER : c.sched.due
      case 'familiarity':
        return fam(c) ?? -1
      case 'alpha':
        return cardTitle(c).toLowerCase()
    }
  }
  return out.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (typeof ka === 'string' && typeof kb === 'string') return ka.localeCompare(kb) * dir
    return ((ka as number) - (kb as number)) * dir
  })
}
