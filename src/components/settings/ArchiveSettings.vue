<script setup lang="ts">
import { liveQuery } from 'dexie'
import ArchivedDeckItem from './ArchivedDeckItem.vue'
import DeletedDeckItem from './DeletedDeckItem.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { DELETED_KEEP_DAYS, purgeAt, type DeletedDeck } from '@/lib/purge'

const data = useData()
const ui = useUi()

const deleted = useLiveQuery<DeletedDeck[]>(() => liveQuery(() => data.listDeleted()), [])

const DAY_MS = 86_400_000
const daysLeft = (d: DeletedDeck) =>
  Math.max(0, Math.ceil((purgeAt(d.deletedAt) - data.now) / DAY_MS))

async function unarchive(id: string, name: string) {
  await data.setArchived(id, false)
  ui.toast(`已還原「${name}」`, 'success')
}

async function restore(d: DeletedDeck) {
  await data.restoreNode(d.node.id)
  ui.toast(`已還原「${d.node.name}」`, 'success')
}

async function purge(d: DeletedDeck) {
  const ok = await ui.confirm(`永久刪除「${d.node.name}」？`, {
    message: d.children.length
      ? `包含 ${d.decks - 1} 個子牌組，牌組、卡片與複習紀錄會立刻被清除，無法復原。\n只想刪除部分的話，請展開後單獨選擇子牌組。`
      : '牌組、卡片與複習紀錄會立刻被清除，無法復原。',
    danger: true,
    confirmText: '永久刪除',
  })
  if (!ok) return
  await data.purgeDeleted(d.node.id)
  ui.toast('已永久刪除', 'success')
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <p class="mb-2 text-sm font-semibold">已封存</p>
      <p v-if="!data.archivedTree.length" class="text-sm text-muted">沒有封存的牌組。</p>
      <ul v-else class="divide-y divide-line">
        <ArchivedDeckItem
          v-for="d in data.archivedTree"
          :key="d.node.id"
          :item="d"
          top
          @unarchive="unarchive(d.node.id, d.node.name)"
        />
      </ul>
      <p class="mt-2 text-xs text-muted">封存的牌組不會出現在列表與學習中，歷史統計仍會保留。</p>
    </div>

    <div>
      <p class="mb-2 text-sm font-semibold">最近刪除</p>
      <p v-if="!deleted.length" class="text-sm text-muted">沒有最近刪除的牌組。</p>
      <ul v-else class="divide-y divide-line">
        <DeletedDeckItem
          v-for="d in deleted"
          :key="d.node.id"
          :item="d"
          :days-left="daysLeft(d)"
          @restore="restore"
          @purge="purge"
        />
      </ul>
      <p class="mt-2 text-xs text-muted">
        刪除後保留 {{ DELETED_KEEP_DAYS }} 天，期間複習紀錄不列入統計；超過就會連同紀錄永久刪除。
      </p>
    </div>
  </div>
</template>
