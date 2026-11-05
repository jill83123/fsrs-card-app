import type { BasicCard, Card, TreeNode, VocabCard } from '@/db/types'
import { emptySched } from '@/lib/fsrs'

export const T0 = new Date(2026, 0, 15, 12, 0, 0).getTime()

export function node(
  id: string,
  parentId: string | null = null,
  extra: Partial<TreeNode> = {},
): TreeNode {
  return {
    id,
    kind: 'deck',
    parentId,
    name: id,
    color: 'blue',
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

export function basic(id: string, deckId: string, extra: Partial<BasicCard> = {}): BasicCard {
  return {
    id,
    type: 'basic',
    deckId,
    front: `front ${id}`,
    back: `back ${id}`,
    starred: false,
    suspended: false,
    sched: emptySched(T0),
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  }
}

export function vocab(id: string, deckId: string, extra: Partial<VocabCard> = {}): VocabCard {
  return {
    id,
    type: 'vocab',
    deckId,
    lang: 'en',
    word: `word ${id}`,
    reading: '',
    meaning: `meaning ${id}`,
    pos: [],
    examples: [],
    note: '',
    starred: false,
    suspended: false,
    sched: emptySched(T0),
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  }
}

export const byDeck = (cards: Card[]) => {
  const m = new Map<string, Card[]>()
  for (const c of cards) m.set(c.deckId, [...(m.get(c.deckId) ?? []), c])
  return m
}
