import type { Card, RelKind, Relations, VocabCard } from '@/db/types'

export const REL_KINDS: { id: RelKind; label: string }[] = [
  { id: 'syn', label: '同義詞' },
  { id: 'ant', label: '反義詞' },
  { id: 'der', label: '衍伸詞' },
  { id: 'conf', label: '易混淆' },
]

/** kinds the online dictionary can suggest (confusable words are always picked by hand) */
export type DictRelKind = Exclude<RelKind, 'conf'>
export const DICT_REL_KINDS = REL_KINDS.filter(
  (k): k is { id: DictRelKind; label: string } => k.id !== 'conf',
)

export type RelatedWords = Record<DictRelKind, string[]>

export const normWord = (w: string) => w.trim().toLowerCase()

/** Vocab cards of a language whose word matches, ignoring case. */
export function findVocab(cards: Card[], lang: string, word: string, exceptId?: string) {
  const k = normWord(word)
  return cards.find(
    (c): c is VocabCard =>
      c.type === 'vocab' && c.lang === lang && c.id !== exceptId && normWord(c.word) === k,
  )
}

export const relCount = (rel?: Relations) =>
  REL_KINDS.reduce((n, k) => n + (rel?.[k.id]?.length ?? 0), 0)
