import { describe, expect, it } from 'vitest'
import { activeFilterCount, applyFilter, defaultFilter } from '../filter'
import { emptySched, makeScheduler, State } from '../fsrs'
import { defaultSynced } from '@/db/defaults'
import { basic, T0, vocab } from './helpers'

const f = makeScheduler(defaultSynced().fsrs)
const ids = (cs: { id: string }[]) => cs.map((c) => c.id)
const run = (over: Partial<ReturnType<typeof defaultFilter>>, list = cards) =>
  ids(applyFilter(list, { ...defaultFilter(), ...over }, f, T0))

const cards = [
  basic('b1', 'd', { front: 'Apple', starred: true, createdAt: 1 }),
  basic('b2', 'd', { front: 'banana', suspended: true, createdAt: 2 }),
  vocab('v1', 'd', { word: 'cat', lang: 'en', createdAt: 3 }),
  vocab('v2', 'd', { word: '猫', lang: 'ja', reading: 'ねこ', createdAt: 4, meaning: '' }),
]

describe('applyFilter', () => {
  it('default: all, newest first', () => {
    expect(run({})).toEqual(['v2', 'v1', 'b2', 'b1'])
  })
  it('type / lang / tri-state', () => {
    expect(run({ type: 'basic' })).toEqual(['b2', 'b1'])
    expect(run({ lang: 'ja' })).toEqual(['v2'])
    expect(run({ starred: 'yes' })).toEqual(['b1'])
    expect(run({ suspended: 'no' })).not.toContain('b2')
    expect(run({ draft: 'yes' })).toEqual(['v2'])
  })
  it('search matches title, subtitle and reading, case-insensitive', () => {
    expect(run({ q: 'APPLE' })).toEqual(['b1'])
    expect(run({ q: 'ねこ' })).toEqual(['v2'])
    expect(run({ q: 'back b1' })).toEqual(['b1'])
  })
  it('sorts alphabetically and manually', () => {
    expect(run({ sort: 'alpha', desc: false, type: 'basic' })).toEqual(['b1', 'b2'])
    const m = [basic('x', 'd', { order: 2 }), basic('y', 'd', { order: 1 }), basic('z', 'd')]
    expect(run({ sort: 'manual' }, m)).toEqual(['y', 'x', 'z'])
  })
  it('filters by scheduler state and familiarity', () => {
    const t = T0 - 10 * 86400_000
    const rev = basic('r', 'd', {
      sched: {
        ...emptySched(t),
        state: State.Review,
        stability: 1,
        difficulty: 5,
        reps: 3,
        last_review: t,
      },
    })
    const all = [rev, basic('n', 'd')]
    expect(run({ states: [State.Review] }, all)).toEqual(['r'])
    expect(run({ fam: 'new' }, all)).toEqual(['n'])
    // a reviewed card falls into exactly one of the familiarity buckets
    const hits = (['low', 'mid', 'high', 'top'] as const).filter((fam) => run({ fam }, all).length)
    expect(hits).toHaveLength(1)
  })
  it('activeFilterCount counts changed fields only', () => {
    expect(activeFilterCount(defaultFilter())).toBe(0)
    const f2 = { ...defaultFilter(), type: 'vocab' as const, states: [State.New], q: 'x' }
    expect(activeFilterCount(f2)).toBe(2)
  })
})
