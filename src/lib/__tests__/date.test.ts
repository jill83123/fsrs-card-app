import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatCountdown,
  formatInterval,
  formatRelative,
  parseYmd,
  studyDayEnd,
  studyDayOf,
  studyDayStart,
  ymd,
} from '../date'

describe('study day', () => {
  it('belongs to the previous day before the rollover hour', () => {
    expect(studyDayOf(new Date(2026, 0, 15, 3, 59), 4)).toBe('2026-01-14')
    expect(studyDayOf(new Date(2026, 0, 15, 4, 0), 4)).toBe('2026-01-15')
  })
  it('crosses month and year boundaries', () => {
    expect(studyDayOf(new Date(2026, 0, 1, 1, 0), 4)).toBe('2025-12-31')
  })
  it('start/end bracket the day', () => {
    const s = studyDayStart('2026-01-15', 4)
    const e = studyDayEnd('2026-01-15', 4)
    expect(new Date(s)).toEqual(new Date(2026, 0, 15, 4))
    expect(new Date(e)).toEqual(new Date(2026, 0, 16, 4))
    expect(studyDayOf(s, 4)).toBe('2026-01-15')
    expect(studyDayOf(e - 1, 4)).toBe('2026-01-15')
    expect(studyDayOf(e, 4)).toBe('2026-01-16')
  })
  it('addDays / ymd / parseYmd round trip', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(ymd(parseYmd('2026-07-09'))).toBe('2026-07-09')
  })
})

describe('formatting', () => {
  it('formatInterval picks a sensible unit', () => {
    expect(formatInterval(30_000)).toBe('<1 分')
    expect(formatInterval(10 * 60_000)).toBe('10 分')
    expect(formatInterval(3 * 3600_000)).toBe('3 小時')
    expect(formatInterval(3 * 86400_000)).toBe('3 天')
    expect(formatInterval(45 * 86400_000)).toBe('1.5 月')
    expect(formatInterval(730 * 86400_000)).toBe('2 年')
  })
  it('formatCountdown never goes negative', () => {
    expect(formatCountdown(-5000)).toBe('0:00')
    expect(formatCountdown(245_000)).toBe('4:05')
    expect(formatCountdown(3729_000)).toBe('1:02:09')
  })
  it('formatRelative', () => {
    const now = Date.now()
    expect(formatRelative(now - 5_000, now)).toBe('剛剛')
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 分鐘前')
    expect(formatRelative(now - 2 * 3600_000, now)).toBe('2 小時前')
  })
})
