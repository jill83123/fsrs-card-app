import { describe, expect, it } from 'vitest'
import { isMeaningCorrect, isSpellingCorrect, normalizeAnswer } from '../spelling'
import { vocab } from './helpers'

describe('spelling', () => {
  it('normalizes case, width, spaces and kana type', () => {
    expect(normalizeAnswer('Ｈｅｌｌｏ World')).toBe('helloworld')
    expect(normalizeAnswer('ネコ')).toBe('ねこ')
  })
  it('accepts the word or the reading', () => {
    const c = vocab('v', 'd', { word: '猫', reading: 'ねこ' })
    expect(isSpellingCorrect('猫', c)).toBe(true)
    expect(isSpellingCorrect('ネコ', c)).toBe(true)
    expect(isSpellingCorrect('いぬ', c)).toBe(false)
    expect(isSpellingCorrect('', c)).toBe(false)
  })
  it('an empty reading never matches an empty answer', () => {
    expect(isSpellingCorrect(' ', vocab('v', 'd', { reading: '' }))).toBe(false)
  })
})

describe('meaning', () => {
  const c = vocab('v', 'd', { meaning: '讀書、學習（動詞）\nstudy' })
  it('matches any part, ignoring punctuation and bracketed notes', () => {
    expect(isMeaningCorrect('讀書', c)).toBe(true)
    expect(isMeaningCorrect('Study!', c)).toBe(true)
    expect(isMeaningCorrect('跑', c)).toBe(false)
  })
  it('rejects empty and unrelated answers', () => {
    expect(isMeaningCorrect('', c)).toBe(false)
    expect(isMeaningCorrect('跑步', c)).toBe(false)
  })
  it('single characters must match a part exactly', () => {
    expect(isMeaningCorrect('讀', c)).toBe(false)
  })
})
