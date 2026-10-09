import { db, markLocalChange, stamp } from '@/db'
import type { Card, MetaRecord, ReviewLogRecord, TreeNode } from '@/db/types'
import { SETTINGS_META_KEY } from '@/stores/settings'
import { purgeExpired } from './purge'

export const SNAPSHOT_VERSION = 1

export interface Snapshot {
  app: 'recall-cards'
  version: number
  exportedAt: number
  nodes: TreeNode[]
  cards: Card[]
  logs: ReviewLogRecord[]
  settings?: MetaRecord
}

export async function takeSnapshot(): Promise<Snapshot> {
  const [nodes, cards, logs, settings] = await Promise.all([
    db.nodes.toArray(),
    db.cards.toArray(),
    db.logs.toArray(),
    db.meta.get(SETTINGS_META_KEY),
  ])
  return {
    app: 'recall-cards',
    version: SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    nodes,
    cards,
    logs,
    settings,
  }
}

export function isSnapshot(v: unknown): v is Snapshot {
  const s = v as Snapshot
  return (
    !!s &&
    s.app === 'recall-cards' &&
    Array.isArray(s.nodes) &&
    Array.isArray(s.cards) &&
    Array.isArray(s.logs)
  )
}

type Rec = { id: string; updatedAt: number }

/** Same record content, ignoring when it was written. */
const sameContent = (a: object, b: object) =>
  JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 })

/**
 * Last-write-wins per record. A conflict is a record that both sides changed since
 * `since` (this device's last sync) into different content: one side's edit is dropped.
 */
function mergeLww<T extends Rec>(local: T[], remote: T[], since: number) {
  const map = new Map(local.map((r) => [r.id, r]))
  const toLocal: T[] = []
  const conflicts: string[] = []
  let localNewer = false
  const remoteIds = new Set<string>()
  for (const r of remote) {
    remoteIds.add(r.id)
    const l = map.get(r.id)
    if (
      l &&
      since &&
      l.updatedAt > since &&
      r.updatedAt > since &&
      l.updatedAt !== r.updatedAt &&
      !sameContent(l, r)
    ) {
      conflicts.push(r.id)
    }
    if (!l || r.updatedAt > l.updatedAt) {
      map.set(r.id, r)
      toLocal.push(r)
    } else if (l.updatedAt > r.updatedAt) localNewer = true
  }
  if (!localNewer) localNewer = local.some((l) => !remoteIds.has(l.id))
  return { merged: [...map.values()], toLocal, localNewer, conflicts }
}

export interface MergeConflicts {
  nodes: string[]
  cards: string[]
  logs: string[]
  settings: boolean
}

/**
 * Merge a remote snapshot into the local database (last-write-wins per record).
 * Returns the merged snapshot, whether the remote copy is out of date, and the records
 * edited on both sides since `since` (0 = never synced, so nothing counts as a conflict).
 */
export async function mergeIntoLocal(remote: Snapshot, since = 0) {
  const local = await takeSnapshot()
  const n = mergeLww(local.nodes, remote.nodes, since)
  const c = mergeLww(local.cards, remote.cards, since)
  const l = mergeLww(local.logs, remote.logs, since)
  let settings = local.settings
  let settingsChanged = false
  let settingsLocalNewer = false
  const ls = local.settings
  const rs = remote.settings
  const settingsConflict =
    !!ls &&
    !!rs &&
    !!since &&
    ls.updatedAt > since &&
    rs.updatedAt > since &&
    ls.updatedAt !== rs.updatedAt &&
    !sameContent(ls, rs)
  if (
    remote.settings &&
    (!local.settings || remote.settings.updatedAt > local.settings.updatedAt)
  ) {
    settings = remote.settings
    settingsChanged = true
  } else if (
    local.settings &&
    (!remote.settings || local.settings.updatedAt > remote.settings.updatedAt)
  ) {
    settingsLocalNewer = true
  }

  await db.transaction('rw', [db.nodes, db.cards, db.logs, db.meta], async () => {
    if (n.toLocal.length) await db.nodes.bulkPut(n.toLocal)
    if (c.toLocal.length) await db.cards.bulkPut(c.toLocal)
    if (l.toLocal.length) await db.logs.bulkPut(l.toLocal)
    if (settingsChanged && settings) await db.meta.put(settings)
  })

  // expired tombstones (also the ones just pulled) are dropped locally; the remote copy
  // still holds them, so it needs an upload to lose them too
  const purged = await purgeExpired()
  const merged: Snapshot = purged
    ? { ...(await takeSnapshot()), exportedAt: Date.now() }
    : {
        ...local,
        exportedAt: Date.now(),
        nodes: n.merged,
        cards: c.merged,
        logs: l.merged,
        settings,
      }
  return {
    merged,
    settingsChanged,
    remoteOutdated:
      n.localNewer || c.localNewer || l.localNewer || settingsLocalNewer || purged > 0,
    pulled: n.toLocal.length + c.toLocal.length + l.toLocal.length + (settingsChanged ? 1 : 0),
    conflicts: {
      nodes: n.conflicts,
      cards: c.conflicts,
      logs: l.conflicts,
      settings: settingsConflict,
    } satisfies MergeConflicts,
  }
}

/**
 * Replace local data with a snapshot (restore). Every record is re-stamped so the
 * restored state wins over other devices on the next sync, and records that are not
 * in the snapshot are tombstoned.
 */
export async function restoreSnapshot(snap: Snapshot) {
  const t = stamp()
  const restamp = <T extends Rec & { deleted?: boolean }>(arr: T[]) =>
    arr.map((r) => ({ ...r, updatedAt: t }))
  await db.transaction('rw', [db.nodes, db.cards, db.logs, db.meta], async () => {
    for (const [table, list] of [
      [db.nodes, snap.nodes],
      [db.cards, snap.cards],
      [db.logs, snap.logs],
    ] as const) {
      const keep = new Set(list.map((r) => r.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tbl = table as any
      await tbl.filter((r: Rec) => !keep.has(r.id)).modify({ deleted: true, updatedAt: t })
      await tbl.bulkPut(restamp(list as Rec[]))
    }
    if (snap.settings) await db.meta.put({ ...snap.settings, updatedAt: t })
  })
  markLocalChange()
}

export async function gzipJson(data: unknown): Promise<Blob> {
  const stream = new Blob([JSON.stringify(data)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Response(stream, { headers: { 'Content-Type': 'application/gzip' } }).blob()
}

export async function gunzipJson(blob: Blob): Promise<unknown> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(stream).text())
  }
  return JSON.parse(await blob.text())
}
