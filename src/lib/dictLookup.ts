/*
 * Shape of a dictionary lookup result. The lookup itself was removed (the free online sources
 * were unreliable); the "fill from dictionary" button and result sheet are kept hidden until a
 * new source is wired in.
 */
import type { Example } from '@/db/types'
import type { RelatedWords } from '@/lib/relations'

export interface DictResult {
  /** one line per sense */
  meaning: string
  /** default part-of-speech ids */
  pos: string[]
  /** the part of speech of each line of `meaning` (same order); empty when the source does not say */
  meaningPos: string[][]
  examples: Example[]
  /** synonyms, antonyms and derived words (empty when unavailable) */
  related: RelatedWords
  /** where each part of the result came from, one line per source */
  sources: string[]
  /** sources that failed or fell back to a weaker one */
  warnings: string[]
}
