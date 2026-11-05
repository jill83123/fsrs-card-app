import { describe, expect, it } from 'vitest'
import {
  activeSides,
  applySenses,
  cardSubtitle,
  cardTitle,
  findWordMark,
  isComplete,
  isStudyable,
  parseKey,
  plainText,
  schedOf,
  sensesOf,
  sideKey,
} from '../cards'
import { State } from '../fsrs'
import { basic, vocab } from './helpers'

describe('findWordMark', () => {
  it('matches whole English words only', () => {
    expect(findWordMark('cat', 'en', 'A Cat sat')).toBe('Cat')
    expect(findWordMark('cat', 'en', 'concatenate')).toBeUndefined()
  })
  it('finds inflected forms', () => {
    expect(findWordMark('run', 'en', 'He ran home')).toBe('ran')
    expect(findWordMark('study', 'en', 'She studies hard')).toBe('studies')
    expect(findWordMark('stop', 'en', 'stopped it')).toBe('stopped')
    expect(findWordMark('give up', 'en', 'He gave up')).toBe('gave up')
  })
  it('finds Japanese / Korean stems', () => {
    expect(findWordMark('食べる', 'ja', '朝ご飯を食べます')).toBe('食べ')
    expect(findWordMark('勉強する', 'ja', '毎日勉強した')).toBe('勉強')
    expect(findWordMark('읽다', 'ko', '책을 읽어요')).toBe('읽')
  })
  it('empty word gives nothing', () => {
    expect(findWordMark('  ', 'en', 'anything')).toBeUndefined()
  })
})

describe('card status', () => {
  it('isComplete needs both sides', () => {
    expect(isComplete(basic('a', 'd'))).toBe(true)
    expect(isComplete(basic('a', 'd', { back: ' ' }))).toBe(false)
    expect(isComplete(vocab('a', 'd', { meaning: '' }))).toBe(false)
  })
  it('isStudyable excludes deleted, suspended and drafts', () => {
    expect(isStudyable(basic('a', 'd'))).toBe(true)
    expect(isStudyable(basic('a', 'd', { deleted: true }))).toBe(false)
    expect(isStudyable(basic('a', 'd', { suspended: true }))).toBe(false)
    expect(isStudyable(basic('a', 'd', { front: '' }))).toBe(false)
  })
})

describe('sides', () => {
  it('keys round-trip', () => {
    expect(sideKey('x', 'f')).toBe('x')
    expect(sideKey('x', 'r')).toBe('x:r')
    expect(parseKey('x:r')).toEqual({ id: 'x', side: 'r' })
    expect(parseKey('x')).toEqual({ id: 'x', side: 'f' })
  })
  it('reverse side starts only after the forward side reaches review', () => {
    const c = vocab('v', 'd')
    expect(activeSides(c, true)).toEqual(['f'])
    c.sched = { ...c.sched, state: State.Learning }
    expect(activeSides(c, true)).toEqual(['f'])
    c.sched = { ...c.sched, state: State.Review }
    expect(activeSides(c, true)).toEqual(['f', 'r'])
    expect(activeSides(c, false)).toEqual(['f'])
  })
  it('basic cards never reverse', () => {
    const c = basic('b', 'd')
    c.sched = { ...c.sched, state: State.Review }
    expect(activeSides(c, true)).toEqual(['f'])
  })
  it('unreviewed reverse side is a new card', () => {
    expect(schedOf(vocab('v', 'd'), 'r').state).toBe(State.New)
  })
})

describe('text helpers', () => {
  it('plainText strips markdown', () => {
    expect(plainText('**bold** `code` [link](http://x)')).toBe('bold code link')
    expect(plainText('||secret||')).toBe('▒▒▒')
  })
  it('titles and subtitles', () => {
    expect(cardTitle(basic('a', 'd', { front: '**Q**' }))).toBe('Q')
    expect(cardTitle(vocab('v', 'd', { word: ' hi ' }))).toBe('hi')
    expect(cardSubtitle(vocab('v', 'd', { meaning: 'a\nb' }))).toBe('a；b')
  })
})

describe('senses', () => {
  it('older cards fall back to meaning + pos', () => {
    const c = vocab('v', 'd', { meaning: 'run', pos: ['v'] })
    expect(sensesOf(c)).toEqual([{ id: 'v-0', pos: ['v'], meaning: 'run' }])
    expect(sensesOf(vocab('e', 'd', { meaning: '' }))).toEqual([])
  })
  it('applySenses keeps meaning and pos in step', () => {
    const c = vocab('v', 'd')
    applySenses(c, [
      { id: '1', pos: ['v'], meaning: ' 跑 ' },
      { id: '2', pos: ['n', 'v'], meaning: '跑步' },
      { id: '3', pos: [], meaning: '' },
    ])
    expect(c.senses).toHaveLength(2)
    expect(c.meaning).toBe('跑\n跑步')
    expect(c.pos).toEqual(['v', 'n'])
  })
})
