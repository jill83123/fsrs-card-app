import type { Card, TreeNode } from '@/db/types'
import { decksInScope } from './tree'
import { isStudyable, parseKey, schedOf, sideKey, type Side } from './cards'
import { shuffle } from './id'
import { State } from './fsrs'

export type StudyMode = 'review' | 'learn'

/** Queue ids are card keys: the card id, plus ':r' for the reverse side (see `sideKey`). */
export interface QueueItem {
  id: string
  due: number
}

export interface SessionSnapshot {
  main: string[]
  learning: QueueItem[]
  current: string | null
}

export interface StudySession extends SessionSnapshot {
  key: string
  mode: StudyMode
  scope: string | null
  /** due reviews beyond the daily limit: offered afterwards, never forced */
  extra: string[]
  done: number
  history: { key: string; logId: string; snap: SessionSnapshot }[]
}

/** Narrows which new cards a learn session takes. */
export interface NewFilter {
  side: 'all' | 'f' | 'r'
  /**
   * Take exactly these cards (by id), whatever the daily limit says. When omitted the session
   * takes the cards inside each deck's daily limit.
   */
  only?: Set<string>
}

interface NewInput {
  cardsByDeck: Map<string, Card[]>
  limitsOf: (deckId: string) => { newPerDay: number; reviewPerDay: number }
  doneToday: Map<string, { newDone: number; reviewDone: number }>
  newOrder: 'created' | 'random'
  /** which sides of a card are scheduled (reverse only in decks that turned it on) */
  sidesOf: (card: Card) => Side[]
}

interface BuildInput extends NewInput {
  mode: StudyMode
  scope: string | null
  /** Only these decks of the scope (all when omitted). */
  decks?: string[]
  nodes: TreeNode[]
  dayEnd: number
  newFilter?: NewFilter
  /** decks that are paused: skipped */
  paused?: Set<string>
}

/** Queue keys of the new cards one deck contributes to a learn session. */
export function newKeys(deckId: string, i: NewInput, f?: NewFilter): string[] {
  const cards = (i.cardsByDeck.get(deckId) ?? []).filter(isStudyable)
  let fresh = cards
    .flatMap((c) =>
      i.sidesOf(c).map((side) => ({ c, side, key: sideKey(c.id, side), sched: schedOf(c, side) })),
    )
    .filter((x) => x.sched.state === State.New && (!f || f.side === 'all' || f.side === x.side))
  // a word's forward side comes before its reverse side
  fresh =
    i.newOrder === 'random'
      ? shuffle(fresh)
      : fresh.sort((a, b) => a.c.createdAt - b.c.createdAt || +(a.side === 'r') - +(b.side === 'r'))
  const only = f?.only
  if (only) return fresh.filter((x) => only.has(x.c.id)).map((x) => x.key)
  // the reverse side is not limited per day
  const limited = fresh.filter((x) => x.side === 'f')
  const unlimited = fresh.filter((x) => x.side === 'r')
  const done = i.doneToday.get(deckId) ?? { newDone: 0, reviewDone: 0 }
  const room = Math.max(0, i.limitsOf(deckId).newPerDay - done.newDone)
  return [...limited.slice(0, room), ...unlimited].map((x) => x.key)
}

export function buildSession(key: string, i: BuildInput): StudySession {
  const main: string[] = []
  const learning: QueueItem[] = []
  const extra: string[] = []
  for (const deckId of i.decks ?? decksInScope(i.nodes, i.scope)) {
    if (i.paused?.has(deckId)) continue
    const cards = (i.cardsByDeck.get(deckId) ?? []).filter(isStudyable)
    const items = cards.flatMap((c) =>
      i.sidesOf(c).map((side) => ({ c, side, key: sideKey(c.id, side), sched: schedOf(c, side) })),
    )
    const lim = i.limitsOf(deckId)
    const done = i.doneToday.get(deckId) ?? { newDone: 0, reviewDone: 0 }
    if (i.mode === 'review') {
      const due = items.filter((x) => x.sched.state !== State.New && x.sched.due < i.dayEnd)
      const reviews = due
        .filter((x) => x.sched.state === State.Review)
        .sort((a, b) => a.sched.due - b.sched.due)
      // the reverse side is not limited per day
      const limited = reviews.filter((x) => x.side === 'f')
      const unlimited = reviews.filter((x) => x.side === 'r')
      const room = Math.max(0, lim.reviewPerDay - done.reviewDone)
      main.push(...limited.slice(0, room).map((x) => x.key), ...unlimited.map((x) => x.key))
      extra.push(...limited.slice(room).map((x) => x.key))
      for (const x of due)
        if (x.sched.state !== State.Review) learning.push({ id: x.key, due: x.sched.due })
    } else {
      main.push(...newKeys(deckId, i, i.newFilter))
    }
  }
  // interleave decks for reviews so one deck doesn't dominate
  // and finish every forward card before the first reverse card
  const ordered =
    i.mode === 'review'
      ? [
          ...shuffle(main.filter((k) => parseKey(k).side === 'f')),
          ...shuffle(main.filter((k) => parseKey(k).side === 'r')),
        ]
      : main
  learning.sort((a, b) => a.due - b.due)
  return {
    key,
    mode: i.mode,
    scope: i.scope,
    main: ordered,
    learning,
    extra: shuffle(extra),
    current: null,
    done: 0,
    history: [],
  }
}

export const snapshotOf = (s: StudySession): SessionSnapshot => ({
  main: [...s.main],
  learning: s.learning.map((x) => ({ ...x })),
  current: s.current,
})

export type NextResult =
  { kind: 'card'; id: string } | { kind: 'wait'; until: number } | { kind: 'done' }

/** Pick the next card. Learning cards that are due take priority. */
export function pickNext(
  s: StudySession,
  now: number,
  /** card id (either side) that should not come straight back */
  avoid?: string,
  learnAhead = false,
): NextResult {
  s.learning.sort((a, b) => a.due - b.due)
  const first = s.learning[0]
  if (first && first.due <= now && !(parseKey(first.id).id === avoid && s.main.length)) {
    s.learning.shift()
    return { kind: 'card', id: first.id }
  }
  const m = s.main.shift()
  if (m) return { kind: 'card', id: m }
  if (first) {
    if (learnAhead || first.due <= now) {
      s.learning.shift()
      return { kind: 'card', id: first.id }
    }
    return { kind: 'wait', until: first.due }
  }
  return { kind: 'done' }
}

export const remaining = (s: StudySession) =>
  s.main.length + s.learning.length + (s.current ? 1 : 0)

// sessions survive navigating away (e.g. to edit a card) and back
const sessions = new Map<string, StudySession>()
export const getSession = (key: string) => sessions.get(key)
export const putSession = (s: StudySession) => sessions.set(s.key, s)
export const dropSession = (key: string) => sessions.delete(key)
