import { describe, expect, it } from 'vitest'
import { defaultSynced } from '@/db/defaults'
import {
  emptySched,
  fromFsrs,
  isValidSteps,
  makeScheduler,
  parseSteps,
  previewIntervals,
  Rating,
  retentionImpact,
  retrievability,
  State,
  toFsrs,
} from '../fsrs'
import { T0 } from './helpers'

const settings = { ...defaultSynced().fsrs, enableFuzz: false }

describe('steps', () => {
  it('parses valid steps and drops garbage', () => {
    expect(parseSteps('1m 10m, 1h')).toEqual(['1m', '10m', '1h'])
    expect(parseSteps('abc 5m 3x')).toEqual(['5m'])
  })
  it('validates', () => {
    expect(isValidSteps('')).toBe(true)
    expect(isValidSteps('1m 10m')).toBe(true)
    expect(isValidSteps('1m foo')).toBe(false)
  })
})

describe('sched conversion', () => {
  it('round-trips through ts-fsrs', () => {
    const s = emptySched(T0)
    expect(fromFsrs(toFsrs(s))).toEqual(s)
  })
  it('new card is State.New and due now', () => {
    const s = emptySched(T0)
    expect(s.state).toBe(State.New)
    expect(s.due).toBe(T0)
    expect(retrievability(makeScheduler(settings), s, T0)).toBeNull()
  })
})

describe('previewIntervals', () => {
  const f = makeScheduler(settings)
  it('new card: Again/Good use learning steps, Easy graduates', () => {
    const p = previewIntervals(f, emptySched(T0), T0)
    expect(p[Rating.Again]).toBe(60_000)
    expect(p[Rating.Good]).toBe(10 * 60_000)
    expect(p[Rating.Easy]).toBeGreaterThanOrEqual(86400_000)
  })
  it('intervals grow with the grade for a review card', () => {
    const first = f.repeat(toFsrs(emptySched(T0)), new Date(T0))[Rating.Easy].card
    const sched = fromFsrs(first)
    expect(sched.state).toBe(State.Review)
    const p = previewIntervals(f, sched, sched.due)
    expect(p[Rating.Again]).toBeLessThan(p[Rating.Hard])
    expect(p[Rating.Hard]).toBeLessThan(p[Rating.Good])
    expect(p[Rating.Good]).toBeLessThan(p[Rating.Easy])
  })
  it('retrievability falls over time', () => {
    const sched = fromFsrs(f.repeat(toFsrs(emptySched(T0)), new Date(T0))[Rating.Easy].card)
    const soon = retrievability(f, sched, sched.due - 86400_000)!
    const later = retrievability(f, sched, sched.due + 30 * 86400_000)!
    expect(soon).toBeGreaterThan(later)
  })
})

describe('retentionImpact', () => {
  it('is neutral at 90%, longer intervals below it, shorter above', () => {
    expect(retentionImpact(0.9).intervalRatio).toBeCloseTo(1)
    expect(retentionImpact(0.8).intervalRatio).toBeGreaterThan(1)
    expect(retentionImpact(0.95).intervalRatio).toBeLessThan(1)
  })
})
