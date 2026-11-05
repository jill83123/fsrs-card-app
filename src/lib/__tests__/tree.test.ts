import { describe, expect, it } from 'vitest'
import {
  decksInScope,
  deckRows,
  effectiveLimits,
  effectiveReverse,
  effectiveTemplate,
  pathTo,
  pickedDecks,
  subtreeIds,
  validParents,
} from '../tree'
import { node } from './helpers'

const nodes = [
  node('root', null, { order: 0, reverse: true, limits: { newPerDay: 5 } }),
  node('a', 'root', { order: 0, defaultCard: { type: 'vocab', lang: 'ja' } }),
  node('b', 'root', { order: 1, reverse: false, limits: { reviewPerDay: 9 } }),
  node('a1', 'a', { order: 0 }),
  node('other', null, { order: 1 }),
]

describe('tree', () => {
  it('subtreeIds / decksInScope', () => {
    expect(subtreeIds(nodes, 'a').sort()).toEqual(['a', 'a1'])
    expect(decksInScope(nodes, null)).toHaveLength(5)
    expect(decksInScope(nodes, 'root').sort()).toEqual(['a', 'a1', 'b', 'root'])
  })
  it('pathTo is top-down', () => {
    expect(pathTo(nodes, 'a1').map((n) => n.id)).toEqual(['root', 'a', 'a1'])
    expect(pathTo(nodes, 'nope')).toEqual([])
  })
  it('deckRows draws tree guides', () => {
    const rows = deckRows(nodes)
    expect(rows.map((r) => r.node.id)).toEqual(['root', 'a', 'a1', 'b', 'other'])
    expect(rows.find((r) => r.node.id === 'a1')!.tree).toBe('│└')
    expect(rows.find((r) => r.node.id === 'b')!.tree).toBe('└')
    expect(rows.find((r) => r.node.id === 'a1')!.path).toBe('root › a › a1')
  })
  it('validParents excludes own subtree and decks holding cards', () => {
    const ids = validParents(nodes, 'a', (id) => id === 'b').map((n) => n.id)
    expect(ids.sort()).toEqual(['other', 'root'])
  })
  it('inherits settings from the nearest ancestor', () => {
    expect(effectiveReverse(nodes, 'a1')).toBe(true)
    expect(effectiveReverse(nodes, 'b')).toBe(false)
    expect(effectiveReverse(nodes, null)).toBe(false)
    expect(effectiveTemplate(nodes, 'a1')).toEqual({ type: 'vocab', lang: 'ja' })
    expect(effectiveTemplate(nodes, 'b')).toBeUndefined()
    const def = { newPerDay: 20, reviewPerDay: 200 }
    expect(effectiveLimits(nodes, 'b', def)).toMatchObject({
      newPerDay: 5,
      reviewPerDay: 9,
      newFrom: 'root',
      reviewFrom: 'b',
    })
    expect(effectiveLimits(nodes, 'other', def).newPerDay).toBe(20)
  })
  it('pickedDecks', () => {
    expect(pickedDecks(undefined, nodes, null)).toBeUndefined()
    expect(pickedDecks('a,zzz', nodes, 'root')).toEqual(['a'])
  })
})
