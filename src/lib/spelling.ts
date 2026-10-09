import type { Example, VocabCard } from '@/db/types'

/** Lenient form for comparing typed answers: ignores case, width, spaces and kana type. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, '')
}

/** Right when it equals the word, or its reading (so kanji words can be typed in kana). */
export function isSpellingCorrect(input: string, card: VocabCard): boolean {
  const typed = normalizeAnswer(input)
  if (!typed) return false
  return [card.word, card.reading].some((t) => t.trim() && normalizeAnswer(t) === typed)
}

/** A random example sentence to play along with the word, if the card has any. */
export function pickExample(card: VocabCard): Example | undefined {
  const all = card.examples.filter((e) => e.sentence.trim())
  return all[Math.floor(Math.random() * all.length)]
}

/** Letters and digits only, so punctuation and spacing in a meaning don't matter. */
const meaningForm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * A meaning like "讀書、學習" is right when what was typed matches one of its parts
 * (or, for two characters or more, contains / is contained in one); the verdict can still be
 * changed by hand for synonyms.
 */
export function isMeaningCorrect(input: string, card: VocabCard): boolean {
  const typed = meaningForm(input)
  if (!typed) return false
  const parts = card.meaning
    .replace(/[(（][^)）]*[)）]/g, '')
    .split(/[、，,;；/／\n]+/)
    .map(meaningForm)
    .filter(Boolean)
  const whole = meaningForm(card.meaning)
  return [...parts, whole].some(
    (p) => p === typed || (typed.length >= 2 && (p.includes(typed) || typed.includes(p))),
  )
}
