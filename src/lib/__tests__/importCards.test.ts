import { describe, expect, it } from 'vitest'
import { DEFAULT_POS } from '@/db/defaults'
import { matchPos, parseImport } from '../importCards'

const posOf = (l: 'en' | 'ja' | 'ko') => DEFAULT_POS[l]

describe('parseImport', () => {
  it('parses fenced JSON with senses and examples', () => {
    const data = [
      {
        word: 'run',
        senses: [
          { pos: 'v.', meaning: '跑' },
          { pos: ['n.'], meaning: '跑步' },
        ],
        examples: [{ sentence: 'I run daily', translation: '我每天跑步', marks: ['run', 'zzz'] }],
      },
    ]
    const text = '```json\n' + JSON.stringify(data) + '\n```'
    const { rows, skipped } = parseImport(text, posOf, 'en')
    expect(skipped).toBe(0)
    expect(rows[0]!.meaning).toBe('跑\n跑步')
    expect(rows[0]!.senses).toHaveLength(2)
    expect(rows[0]!.examples[0]!.marks).toEqual(['run'])
  })
  it('accepts the single-meaning format, Chinese keys, and object-wrapped lists', () => {
    const { rows } = parseImport(
      '{"cards":[{"單字":"猫","語言":"日文","意思":"cat"}]}',
      posOf,
      'en',
    )
    expect(rows[0]).toMatchObject({ word: '猫', lang: 'ja', meaning: 'cat' })
  })
  it('skips items missing a word or meaning', () => {
    const text = '[{"word":"a"},{"meaning":"b"},{"word":"c","meaning":"d"}]'
    const { rows, skipped } = parseImport(text, posOf, 'en')
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(2)
  })
  it('collects unknown parts of speech', () => {
    const { rows } = parseImport('[{"word":"a","meaning":"b","pos":"zzz"}]', posOf, 'en')
    expect(rows[0]!.unknownPos).toEqual(['zzz'])
  })
  it('throws on invalid input', () => {
    expect(() => parseImport('not json', posOf, 'en')).toThrow()
    expect(() => parseImport('{"a":1}', posOf, 'en')).toThrow('陣列')
  })
})

describe('matchPos', () => {
  it('matches by id and label', () => {
    const opt = DEFAULT_POS.en[0]!
    expect(matchPos(opt.id, DEFAULT_POS.en)?.id).toBe(opt.id)
    expect(matchPos(opt.label, DEFAULT_POS.en)?.id).toBe(opt.id)
    expect(matchPos('', DEFAULT_POS.en)).toBeUndefined()
  })
})
