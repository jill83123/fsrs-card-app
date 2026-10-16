import type { NewFilter } from './session'

/** What the user chose to learn in the next learn session. */
export interface NewPick {
  side: 'all' | 'f' | 'r'
  /** ids of the chosen cards; null = the default (the cards inside the daily limit) */
  chosen: string[] | null
}

export const emptyPick = (): NewPick => ({ side: 'all', chosen: null })

export const isPickActive = (p: NewPick) => p.side !== 'all' || p.chosen !== null

// kept only while the page is open: a choice is for one study round, not a standing setting
const picks = new Map<string, NewPick>()
const keyOf = (scope: string | null) => scope ?? '*'

export const setPick = (scope: string | null, p: NewPick) => picks.set(keyOf(scope), p)
export const getPick = (scope: string | null): NewPick => picks.get(keyOf(scope)) ?? emptyPick()

export function toFilter(p: NewPick): NewFilter | undefined {
  if (!isPickActive(p)) return undefined
  return { side: p.side, only: p.chosen ? new Set(p.chosen) : undefined }
}
