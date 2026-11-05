import { describe, expect, it } from 'vitest'
import { buildSession, newKeys, pickNext, remaining } from '../session'
import { emptySched, fromFsrs, makeScheduler, Rating, State, toFsrs } from '../fsrs'
import { defaultSynced } from '@/db/defaults'
import { basic, byDeck, node, T0, vocab } from './helpers'
import type { Card } from '@/db/types'

const DAY = 86400_000
const nodes = [node('d')]
const f = makeScheduler({ ...defaultSynced().fsrs, enableFuzz: false })

const reviewSched = (due: number) => ({
  ...fromFsrs(f.repeat(toFsrs(emptySched(T0)), new Date(T0))[Rating.Easy].card),
  due,
})

function input(cards: Card[], over: Partial<Parameters<typeof buildSession>[1]> = {}) {
  return {
    mode: 'review' as const,
    scope: null,
    nodes,
    dayEnd: T0 + DAY,
    cardsByDeck: byDeck(cards),
    limitsOf: () => ({ newPerDay: 2, reviewPerDay: 2 }),
    doneToday: new Map(),
    newOrder: 'created' as const,
    sidesOf: () => ['f' as const],
    ...over,
  }
}

describe('learn session', () => {
  const cards = [1, 2, 3].map((n) => basic(`c${n}`, 'd', { createdAt: n }))
  it('respects the daily new-card limit, oldest first', () => {
    expect(newKeys('d', input(cards, { mode: 'learn' }))).toEqual(['c1', 'c2'])
  })
  it('subtracts what was already done today', () => {
    const i = input(cards, {
      mode: 'learn',
      doneToday: new Map([['d', { newDone: 1, reviewDone: 0 }]]),
    })
    expect(newKeys('d', i)).toEqual(['c1'])
  })
  it('skips suspended cards and drafts', () => {
    const cs = [
      basic('s', 'd', { suspended: true }),
      basic('e', 'd', { front: '' }),
      basic('ok', 'd'),
    ]
    expect(newKeys('d', input(cs, { mode: 'learn' }))).toEqual(['ok'])
  })
  it('`only` ignores the limit', () => {
    const only = new Set(['c3'])
    expect(newKeys('d', input(cards, { mode: 'learn' }), { side: 'all', only })).toEqual(['c3'])
  })
  it('reverse side is not limited and comes after its forward side', () => {
    const v = [vocab('v1', 'd', { createdAt: 1 }), vocab('v2', 'd', { createdAt: 2 })]
    const i = input(v, {
      mode: 'learn',
      sidesOf: () => ['f', 'r'],
      limitsOf: () => ({ newPerDay: 1, reviewPerDay: 1 }),
    })
    expect(newKeys('d', i)).toEqual(['v1', 'v1:r', 'v2:r'])
  })
})

describe('review session', () => {
  it('queues due reviews within the limit, the rest as extra', () => {
    const cs = [1, 2, 3].map((n) => basic(`r${n}`, 'd', { sched: reviewSched(T0 - n * 1000) }))
    const s = buildSession('k', input(cs))
    expect(s.main).toHaveLength(2)
    expect(s.extra).toHaveLength(1)
  })
  it('excludes cards not due before the day ends and new cards', () => {
    const cs = [basic('future', 'd', { sched: reviewSched(T0 + 2 * DAY) }), basic('fresh', 'd')]
    const s = buildSession('k', input(cs))
    expect(s.main).toEqual([])
    expect(s.learning).toEqual([])
  })
  it('learning cards go to the timed queue, sorted by due', () => {
    const learning = (due: number) => ({ ...emptySched(T0), state: State.Learning, due })
    const cs = [
      basic('l2', 'd', { sched: learning(T0 + 2000) }),
      basic('l1', 'd', { sched: learning(T0 + 1000) }),
    ]
    const s = buildSession('k', input(cs))
    expect(s.learning.map((x) => x.id)).toEqual(['l1', 'l2'])
  })
  it('paused decks are skipped', () => {
    const cs = [basic('r', 'd', { sched: reviewSched(T0 - 1) })]
    expect(buildSession('k', input(cs, { paused: new Set(['d']) })).main).toEqual([])
  })
})

describe('pickNext', () => {
  const session = () => buildSession('k', input([], { mode: 'learn' }))
  it('due learning card wins, then main, then waits, then done', () => {
    const s = session()
    s.main = ['m1']
    s.learning = [{ id: 'l1', due: 100 }]
    expect(pickNext(s, 200)).toEqual({ kind: 'card', id: 'l1' })
    expect(pickNext(s, 200)).toEqual({ kind: 'card', id: 'm1' })
    s.learning = [{ id: 'l2', due: 500 }]
    expect(pickNext(s, 200)).toEqual({ kind: 'wait', until: 500 })
    expect(pickNext(s, 200, undefined, true)).toEqual({ kind: 'card', id: 'l2' })
    expect(pickNext(s, 200)).toEqual({ kind: 'done' })
  })
  it('does not bring back the card just seen while others remain', () => {
    const s = session()
    s.main = ['m1']
    s.learning = [{ id: 'x:r', due: 0 }]
    expect(pickNext(s, 10, 'x')).toEqual({ kind: 'card', id: 'm1' })
  })
  it('remaining counts the current card', () => {
    const s = session()
    s.main = ['a']
    s.learning = [{ id: 'b', due: 0 }]
    s.current = 'c'
    expect(remaining(s)).toBe(3)
  })
})
