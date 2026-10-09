import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CHANGE_EVENT, getMeta, lastLocalChange } from '@/db'
import { cachedToken, clearToken, preloadGis, requestToken, revokeToken } from '@/lib/google/gis'
import {
  createFile,
  deleteFile,
  downloadFile,
  DriveAuthError,
  listFiles,
  updateFile,
  type DriveFile,
} from '@/lib/google/drive'
import {
  gunzipJson,
  gzipJson,
  isSnapshot,
  mergeIntoLocal,
  restoreSnapshot,
  SNAPSHOT_VERSION,
  takeSnapshot,
  type MergeConflicts,
  type Snapshot,
} from '@/lib/snapshot'
import type { SyncedSettings } from '@/db/types'
import { SETTINGS_META_KEY, useSettings } from './settings'
import { useUi } from './ui'

const SYNC_FILE = 'sync.json.gz'
const KEEP = 3
const LS_CONNECTED = 'sr.google.connected'
const LS_LAST_SYNC = 'sr.google.lastSync'
const LS_LAST_AUTO_BACKUP = 'sr.google.lastAutoBackup'
const LS_CONFLICT = 'sr.google.conflict'
/** Re-merge at most this many times when another device uploads while we sync. */
const MAX_RETRIES = 3
/** Without local edits, pull other devices' changes at most this often. */
const PULL_INTERVAL = 10 * 60_000

export type SyncStatus = 'off' | 'idle' | 'dirty' | 'syncing' | 'reauth' | 'offline' | 'error'

export interface BackupEntry {
  id: string
  kind: 'auto' | 'manual'
  time: number
  size: number
  cards: number
}

/** Records edited on two devices where the older edit was dropped (shown until dismissed). */
export interface SyncConflict {
  time: number
  nodes: number
  cards: number
  logs: number
  settings: boolean
}

const readNum = (k: string) => Number(localStorage.getItem(k) ?? 0)

function readConflict(): SyncConflict | null {
  try {
    return JSON.parse(localStorage.getItem(LS_CONFLICT) ?? 'null')
  } catch {
    return null
  }
}

export function describeConflict(c: SyncConflict) {
  const parts = [
    c.cards && `${c.cards} 張卡片`,
    c.nodes && `${c.nodes} 個牌組`,
    c.logs && `${c.logs} 筆複習紀錄`,
    c.settings && '設定',
  ].filter(Boolean)
  return `${parts.join('、')}在兩台裝置上都被修改過，已保留較晚修改的版本，較早的那次修改沒有套用。`
}

export const useSync = defineStore('sync', () => {
  const settings = useSettings()
  const ui = useUi()
  const connected = ref(localStorage.getItem(LS_CONNECTED) === '1')
  if (connected.value) preloadGis()
  const lastSync = ref(readNum(LS_LAST_SYNC))
  const localChange = ref(lastLocalChange())
  const busy = ref(false)
  const needsAuth = ref(false)
  const error = ref<string | null>(null)
  const online = ref(navigator.onLine)
  const backups = ref<BackupEntry[]>([])
  const conflict = ref<SyncConflict | null>(readConflict())

  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))

  const status = computed<SyncStatus>(() => {
    if (!connected.value) return 'off'
    if (busy.value) return 'syncing'
    if (!online.value) return 'offline'
    if (needsAuth.value) return 'reauth'
    if (error.value) return 'error'
    if (localChange.value > lastSync.value) return 'dirty'
    return 'idle'
  })

  const clientId = computed(() => settings.device.sync.clientId.trim())

  // a popup may only open straight from a click, so never request one after an await:
  // every caller below reaches requestToken synchronously from its click handler
  async function token(interactive: boolean): Promise<string | null> {
    const t = cachedToken()
    if (t) return t
    if (!interactive) {
      needsAuth.value = true
      return null
    }
    const fresh = await requestToken(clientId.value)
    needsAuth.value = false
    return fresh
  }

  async function withDrive<T>(
    interactive: boolean,
    fn: (token: string) => Promise<T>,
  ): Promise<T | undefined> {
    if (!online.value) return
    const t = await token(interactive)
    if (!t) return
    try {
      return await fn(t)
    } catch (e) {
      if (e instanceof DriveAuthError) {
        // the token was rejected mid-operation; opening the popup now would be blocked
        clearToken()
        needsAuth.value = true
        if (interactive) throw new Error('Google 授權已過期，請再按一次')
        return
      }
      throw e
    }
  }

  async function connect() {
    error.value = null
    try {
      await requestToken(clientId.value, true)
      connected.value = true
      needsAuth.value = false
      localStorage.setItem(LS_CONNECTED, '1')
      await syncNow(true)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  async function disconnect() {
    await revokeToken()
    connected.value = false
    needsAuth.value = false
    error.value = null
    localStorage.removeItem(LS_CONNECTED)
  }

  let syncing: Promise<void> | null = null

  /** Pull, merge, and push. `interactive` = triggered by a user gesture (may show a popup). */
  function syncNow(interactive = false): Promise<void> {
    if (!connected.value) return Promise.resolve()
    syncing ??= (async () => {
      busy.value = true
      const startedAt = Date.now()
      try {
        await withDrive(interactive, async (t) => {
          const seen = {
            nodes: new Set<string>(),
            cards: new Set<string>(),
            logs: new Set<string>(),
          }
          let settingsConflict = false
          const collect = (c: MergeConflicts) => {
            for (const k of ['nodes', 'cards', 'logs'] as const)
              c[k].forEach((id) => seen[k].add(id))
            settingsConflict ||= c.settings
          }
          let snapshot!: Snapshot
          for (let attempt = 1; ; attempt++) {
            const file = (await listFiles(t, SYNC_FILE)).find((f) => f.name === SYNC_FILE)
            let push = true
            if (file) {
              const remote = await gunzipJson(await downloadFile(t, file.id))
              if (!isSnapshot(remote)) throw new Error('雲端同步檔格式不正確')
              const res = await mergeIntoLocal(remote, lastSync.value)
              snapshot = res.merged
              push = res.remoteOutdated
              collect(res.conflicts)
              if (res.settingsChanged && snapshot.settings) {
                await settings.applyRemote(snapshot.settings.value as SyncedSettings)
              }
            } else {
              snapshot = await takeSnapshot()
            }
            if (!push) break
            // another device may have uploaded while we merged: merge its copy too
            // instead of overwriting it
            const latest = (await listFiles(t, SYNC_FILE)).find((f) => f.name === SYNC_FILE)
            if (latest?.modifiedTime !== file?.modifiedTime) {
              if (attempt < MAX_RETRIES) continue
              throw new Error('雲端資料一直在變動，請稍後再同步一次')
            }
            const blob = await gzipJson(snapshot)
            if (file) await updateFile(t, file.id, blob)
            else await createFile(t, SYNC_FILE, blob)
            break
          }
          const found: SyncConflict = {
            time: Date.now(),
            nodes: seen.nodes.size,
            cards: seen.cards.size,
            logs: seen.logs.size,
            settings: settingsConflict,
          }
          if (found.nodes || found.cards || found.logs || found.settings) {
            conflict.value = found
            localStorage.setItem(LS_CONFLICT, JSON.stringify(found))
            ui.toast(`同步時發現衝突：${describeConflict(found)}`, 'info', undefined, 10_000)
          }
          lastSync.value = startedAt
          localStorage.setItem(LS_LAST_SYNC, String(startedAt))
          error.value = null
          needsAuth.value = false
          await maybeAutoBackup(t, snapshot)
        })
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        if (interactive) throw e
      } finally {
        busy.value = false
        syncing = null
      }
    })()
    return syncing
  }

  // --- backups -------------------------------------------------------------
  function parseBackup(f: DriveFile): BackupEntry | null {
    const m = /^backup-(auto|manual)-(\d+)\.json\.gz$/.exec(f.name)
    if (!m) return null
    return {
      id: f.id,
      kind: m[1] as 'auto' | 'manual',
      time: Number(m[2]),
      size: Number(f.size ?? 0),
      cards: Number(f.appProperties?.cards ?? 0),
    }
  }

  async function writeBackup(t: string, kind: 'auto' | 'manual', snap?: Snapshot) {
    const s = snap ?? (await takeSnapshot())
    const live = s.cards.filter((c) => !c.deleted).length
    await createFile(t, `backup-${kind}-${Date.now()}.json.gz`, await gzipJson(s), {
      cards: String(live),
    })
    const all = (await listFiles(t, 'backup-'))
      .map(parseBackup)
      .filter((b): b is BackupEntry => !!b)
    const mine = all.filter((b) => b.kind === kind).sort((a, b) => b.time - a.time)
    for (const old of mine.slice(KEEP)) await deleteFile(t, old.id)
  }

  async function maybeAutoBackup(t: string, snap: Snapshot) {
    const day = new Date().toDateString()
    if (localStorage.getItem(LS_LAST_AUTO_BACKUP) === day) return
    await writeBackup(t, 'auto', snap)
    localStorage.setItem(LS_LAST_AUTO_BACKUP, day)
  }

  /** `interactive` only when called straight from a click (it may open the login popup). */
  async function refreshBackups(interactive = false) {
    await withDrive(interactive, async (t) => {
      backups.value = (await listFiles(t, 'backup-'))
        .map(parseBackup)
        .filter((b): b is BackupEntry => !!b)
        .sort((a, b) => b.time - a.time)
    })
  }

  async function backupNow() {
    await withDrive(true, (t) => writeBackup(t, 'manual'))
    await refreshBackups()
  }

  async function restoreBackup(id: string) {
    await withDrive(true, async (t) => {
      const data = await gunzipJson(await downloadFile(t, id))
      if (!isSnapshot(data)) throw new Error('備份檔格式不正確')
      await restoreSnapshot(data)
    })
    await reloadSettings()
    await syncNow(true)
  }

  /**
   * Clear the cards, decks and review history on every device: back up first, then
   * tombstone every record and sync, so other devices delete them on their next sync.
   * Settings and the cloud backups are kept.
   */
  async function wipeEverywhere() {
    if (!online.value) throw new Error('目前離線，無法清除雲端資料')
    const backedUp = await withDrive(true, async (t) => {
      await writeBackup(t, 'manual')
      return true
    })
    if (!backedUp) throw new Error('無法連線 Google Drive，資料沒有清除')
    await restoreSnapshot({
      app: 'recall-cards',
      version: SNAPSHOT_VERSION,
      exportedAt: Date.now(),
      nodes: [],
      cards: [],
      logs: [],
    })
    dismissConflict()
    await syncNow(true)
    await refreshBackups()
  }

  async function deleteAllBackups() {
    await withDrive(true, async (t) => {
      for (const f of await listFiles(t, 'backup-')) if (parseBackup(f)) await deleteFile(t, f.id)
    })
    await refreshBackups()
  }

  function dismissConflict() {
    conflict.value = null
    localStorage.removeItem(LS_CONFLICT)
  }

  async function reloadSettings() {
    const rec = await getMeta<SyncedSettings>(SETTINGS_META_KEY)
    if (rec) await settings.applyRemote(rec.value)
  }

  // --- automatic triggers --------------------------------------------------
  const dirty = () => localChange.value > lastSync.value
  /** Sync if there are local edits to push, or if the remote copy hasn't been pulled for a while. */
  function syncIfNeeded() {
    if (dirty() || Date.now() - lastSync.value > PULL_INTERVAL) void syncNow(false)
  }

  let debounce: ReturnType<typeof setTimeout> | undefined
  function init() {
    window.addEventListener(CHANGE_EVENT, (e) => {
      localChange.value = (e as CustomEvent<number>).detail
      if (!connected.value || !settings.device.sync.auto) return
      clearTimeout(debounce)
      debounce = setTimeout(() => void syncNow(false), 20_000)
    })
    document.addEventListener('visibilitychange', () => {
      if (!connected.value || !settings.device.sync.auto) return
      if (document.visibilityState === 'hidden' && dirty()) {
        clearTimeout(debounce)
        void syncNow(false)
      } else if (document.visibilityState === 'visible') {
        syncIfNeeded()
      }
    })
    window.addEventListener('online', () => {
      if (connected.value && settings.device.sync.auto) syncIfNeeded()
    })
    if (connected.value && settings.device.sync.auto) void syncNow(false)
  }

  return {
    connected,
    lastSync,
    status,
    error,
    backups,
    busy,
    conflict,
    dismissConflict,
    init,
    connect,
    disconnect,
    syncNow,
    refreshBackups,
    backupNow,
    restoreBackup,
    wipeEverywhere,
    deleteAllBackups,
    reloadSettings,
  }
})
