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
  done: number
  history: { key: string; logId: string; snap: SessionSnapshot }[]
}

interface BuildInput {
  mode: StudyMode
  scope: string | null
  /** Only these decks of the scope (all when omitted). */
  decks?: string[]
  nodes: TreeNode[]
  cardsByDeck: Map<string, Card[]>
  dayEnd: number
  limitsOf: (deckId: string) => { newPerDay: number; reviewPerDay: number }
  doneToday: Map<string, { newDone: number; reviewDone: number }>
  newOrder: 'created' | 'random'
  /** which sides of a card are scheduled (reverse only in decks that turned it on) */
  sidesOf: (card: Card) => Side[]
}

export function buildSession(key: string, i: BuildInput): StudySession {
  const main: string[] = []
  const learning: QueueItem[] = []
  for (const deckId of i.decks ?? decksInScope(i.nodes, i.scope)) {
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
      main.push(
        ...limited.slice(0, Math.max(0, lim.reviewPerDay - done.reviewDone)).map((x) => x.key),
        ...unlimited.map((x) => x.key),
      )
      for (const x of due)
        if (x.sched.state !== State.Review) learning.push({ id: x.key, due: x.sched.due })
    } else {
      let fresh = items.filter((x) => x.sched.state === State.New)
      // a word's forward side comes before its reverse side
      fresh =
        i.newOrder === 'random'
          ? shuffle(fresh)
          : fresh.sort(
              (a, b) => a.c.createdAt - b.c.createdAt || +(a.side === 'r') - +(b.side === 'r'),
            )
      // the reverse side is not limited per day
      const limited = fresh.filter((x) => x.side === 'f')
      const unlimited = fresh.filter((x) => x.side === 'r')
      main.push(
        ...limited.slice(0, Math.max(0, lim.newPerDay - done.newDone)).map((x) => x.key),
        ...unlimited.map((x) => x.key),
      )
    }
  }
  // interleave decks for reviews so one deck doesn't dominate
  const ordered = i.mode === 'review' ? shuffle(main) : main
  learning.sort((a, b) => a.due - b.due)
  return {
    key,
    mode: i.mode,
    scope: i.scope,
    main: ordered,
    learning,
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
