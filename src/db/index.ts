import Dexie, { type EntityTable } from 'dexie'
import type { Card, MetaRecord, ReviewLogRecord, TreeNode } from './types'

export class AppDB extends Dexie {
  nodes!: EntityTable<TreeNode, 'id'>
  cards!: EntityTable<Card, 'id'>
  logs!: EntityTable<ReviewLogRecord, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor() {
    super('recall-cards')
    this.version(1).stores({
      nodes: 'id, parentId, updatedAt',
      cards: 'id, deckId, updatedAt, sched.due',
      logs: 'id, cardId, studyDay, review, updatedAt',
      meta: 'key',
    })
  }
}

export const db = new AppDB()

const LOCAL_CHANGE_KEY = 'sr.lastLocalChange'
export const CHANGE_EVENT = 'sr:local-change'

/** Record that local data changed (drives the "unsynced changes" indicator and auto sync). */
export function markLocalChange() {
  const now = Date.now()
  try {
    localStorage.setItem(LOCAL_CHANGE_KEY, String(now))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: now }))
}

export function lastLocalChange(): number {
  try {
    return Number(localStorage.getItem(LOCAL_CHANGE_KEY) ?? 0)
  } catch {
    return 0
  }
}

/** Monotonic-ish timestamp so two writes in the same ms still order correctly. */
let lastStamp = 0
export function stamp(): number {
  const now = Date.now()
  lastStamp = now > lastStamp ? now : lastStamp + 1
  return lastStamp
}

export async function getMeta<T>(key: string): Promise<(MetaRecord & { value: T }) | undefined> {
  return (await db.meta.get(key)) as (MetaRecord & { value: T }) | undefined
}

export async function setMeta(key: string, value: unknown, updatedAt = stamp()) {
  await db.meta.put({ key, value, updatedAt })
}
