import { db } from '@/db'
import { isSnapshot, restoreSnapshot, takeSnapshot } from './snapshot'
import { ymd } from './date'

export async function exportJson() {
  const snap = await takeSnapshot()
  const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recall-backup-${ymd(new Date())}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function importJson(file: File) {
  const data = JSON.parse(await file.text())
  if (!isSnapshot(data)) throw new Error('檔案格式不正確')
  await restoreSnapshot(data)
  return data.cards.filter((c) => !c.deleted).length
}

export async function wipeLocal() {
  await db.transaction('rw', [db.nodes, db.cards, db.logs, db.meta], async () => {
    await Promise.all([db.nodes.clear(), db.cards.clear(), db.logs.clear(), db.meta.clear()])
  })
}
