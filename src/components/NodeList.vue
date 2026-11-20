<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Archive, Pause, Pencil, Play, Trash2, X } from '@lucide/vue'
import NodeRow from './NodeRow.vue'
import type { TreeNode } from '@/db/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { DELETED_KEEP_DAYS } from '@/lib/purge'
import { moved, useDragSort } from '@/composables/useDragSort'

const props = defineProps<{
  nodes: TreeNode[]
  sorting?: boolean
}>()
/** long-pressing a row starts picking several decks to pause, rename, archive or delete at once */
const selecting = defineModel<boolean>('selecting', { default: false })
const data = useData()
const ui = useUi()

// show the new order right away instead of waiting for the database round trip
const local = ref<string[] | null>(null)
watch(
  () => props.nodes.map((n) => `${n.id}:${n.order}`).join(),
  () => (local.value = null),
)
const list = computed(() => {
  if (!local.value) return props.nodes
  const byId = new Map(props.nodes.map((n) => [n.id, n]))
  return local.value.map((id) => byId.get(id)).filter((n): n is TreeNode => !!n)
})

const drag = useDragSort((from, to) => {
  const ids = moved(
    list.value.map((n) => n.id),
    from,
    to,
  )
  local.value = ids
  void data.reorderNodes(ids)
})

const selected = ref(new Set<string>())
watch(selecting, (v) => {
  if (!v) selected.value = new Set()
})
const picked = computed(() => list.value.filter((n) => selected.value.has(n.id)))

function toggle(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function hold(id: string) {
  selected.value = new Set([id])
  selecting.value = true
}

function finish() {
  selected.value = new Set()
  selecting.value = false
}

async function pause(paused: boolean) {
  const ids = picked.value.map((n) => n.id)
  if (!ids.length) return
  await data.setPausedMany(ids, paused)
  ui.toast(`${paused ? '已暫停' : '已恢復'} ${ids.length} 個牌組`, 'success')
}

async function rename() {
  const n = picked.value[0]
  if (picked.value.length !== 1 || !n) return
  const name = (await ui.prompt('修改牌組名稱', { value: n.name, confirmText: '儲存' }))?.trim()
  if (!name || name === n.name) return
  await data.updateNode(n.id, { name })
  ui.toast('已更新名稱', 'success')
}

async function archive() {
  const items = picked.value
  if (!items.length) return
  const ok = await ui.confirm(`封存 ${items.length} 個牌組？`, {
    items: items.map((n) => n.name),
    itemsFirst: true,
    message:
      '牌組（含子牌組）會從列表與學習中隱藏，歷史統計仍會保留。\n可以在「設定 → 封存與最近刪除」還原。',
    confirmText: '封存',
  })
  if (!ok) return
  for (const n of items) await data.setArchived(n.id, true)
  ui.toast(`已封存 ${items.length} 個牌組`, 'success')
  finish()
}

async function remove() {
  const items = picked.value
  if (!items.length) return
  const count = items.reduce((sum, n) => sum + data.cardsInScope(n.id).length, 0)
  const ok = await ui.confirm(`刪除 ${items.length} 個牌組？`, {
    items: items.map((n) => n.name),
    itemsFirst: true,
    message:
      (count
        ? `底下的所有子項目與 ${count} 張卡片都會一併刪除，`
        : '底下的所有子項目都會一併刪除，') +
      `這些牌組的複習紀錄也不再列入統計。\n可以在「設定 → 封存與最近刪除」中於 ${DELETED_KEEP_DAYS} 天內還原，超過就會永久刪除。\n只想暫時收起來的話，請改用「封存」。`,
    danger: true,
    confirmText: '刪除',
  })
  if (!ok) return
  for (const n of items) await data.deleteNode(n.id)
  ui.toast(`已刪除 ${items.length} 個牌組`, 'success')
  finish()
}
</script>

<template>
  <div
    v-for="(n, i) in list"
    :key="n.id"
    data-sort-item
    class="bg-surface"
    :class="drag.dragging(i) && 'shadow-lg'"
    :style="drag.style(i)"
  >
    <NodeRow
      :node="n"
      :sorting="sorting"
      :selectable="selecting"
      :selected="selected.has(n.id)"
      @grip="drag.start($event, i)"
      @toggle="toggle(n.id)"
      @hold="hold(n.id)"
    />
  </div>

  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="selecting"
        class="fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
      >
        <div
          class="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl scrollbar-none"
        >
          <span class="pr-2 pl-1.5 text-sm font-bold whitespace-nowrap"
            >{{ picked.length }} 個</span
          >
          <button
            class="icon-btn disabled:opacity-40"
            title="暫停"
            :disabled="!picked.length"
            @click="pause(true)"
          >
            <Pause :size="18" />
          </button>
          <button
            class="icon-btn disabled:opacity-40"
            title="恢復"
            :disabled="!picked.length"
            @click="pause(false)"
          >
            <Play :size="18" />
          </button>
          <button
            class="icon-btn disabled:opacity-40"
            title="改名稱（限選一個）"
            :disabled="picked.length !== 1"
            @click="rename"
          >
            <Pencil :size="18" />
          </button>
          <button
            class="icon-btn disabled:opacity-40"
            title="封存"
            :disabled="!picked.length"
            @click="archive"
          >
            <Archive :size="18" />
          </button>
          <button
            class="icon-btn text-danger disabled:opacity-40"
            title="刪除"
            :disabled="!picked.length"
            @click="remove"
          >
            <Trash2 :size="18" />
          </button>
          <button class="icon-btn" title="結束選取" @click="finish"><X :size="18" /></button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
