import { db } from '@/db'
import type { TreeNode } from '@/db/types'

/** Deleted decks stay restorable this long, then are removed for good. */
export const DELETED_KEEP_DAYS = 30
const DAY_MS = 86_400_000

export interface DeletedDeck {
  node: TreeNode
  /** decks in this subtree, the node itself included */
  decks: number
  /** cards in this subtree */
  cards: number
  deletedAt: number
  /** deleted sub-decks of the same batch */
  children: DeletedDeck[]
}

export interface ArchivedDeck {
  node: TreeNode
  decks: number
  cards: number
  children: ArchivedDeck[]
}

export const purgeAt = (deletedAt: number) => deletedAt + DELETED_KEEP_DAYS * DAY_MS

/**
 * Physically remove tombstones (deleted nodes, cards, logs) older than DELETED_KEEP_DAYS,
 * or, with `batch`, the ones deleted at exactly that timestamp. Then drop review logs whose
 * card no longer exists. Returns how many records were removed.
 */
export async function purgeExpired(batch?: number): Promise<number> {
  const cutoff = Date.now() - DELETED_KEEP_DAYS * DAY_MS
  const due = (r: { deleted?: boolean; updatedAt: number }) =>
    !!r.deleted && (batch === undefined ? r.updatedAt < cutoff : r.updatedAt === batch)
  return db.transaction('rw', db.nodes, db.cards, db.logs, async () => {
    let n = 0
    for (const table of [db.nodes, db.cards, db.logs]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = table as any
      const keys: string[] = await tbl.filter(due).primaryKeys()
      if (keys.length) await tbl.bulkDelete(keys)
      n += keys.length
    }
    const withLogs = (await db.logs.orderBy('cardId').uniqueKeys()) as string[]
    if (withLogs.length) {
      const existing = new Set(await db.cards.where('id').anyOf(withLogs).primaryKeys())
      const orphans = withLogs.filter((id) => !existing.has(id))
      if (orphans.length) n += await db.logs.where('cardId').anyOf(orphans).delete()
    }
    return n
  })
}
