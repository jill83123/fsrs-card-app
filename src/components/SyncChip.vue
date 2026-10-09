<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Cloud, CloudAlert, CloudOff, CloudUpload, LoaderCircle, RefreshCw } from '@lucide/vue'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import { formatRelative } from '@/lib/date'
import { useData } from '@/stores/data'

const sync = useSync()
const ui = useUi()
const data = useData()
const router = useRouter()

const view = computed(() => {
  // reference `now` so relative time refreshes
  void data.now
  switch (sync.status) {
    case 'off':
      return { icon: CloudOff, text: '未連線', cls: 'text-muted' }
    case 'syncing':
      return { icon: LoaderCircle, text: '同步中', cls: 'text-primary', spin: true }
    case 'offline':
      return { icon: CloudOff, text: '離線', cls: 'text-muted' }
    case 'reauth':
      return { icon: RefreshCw, text: '點擊重新連線', cls: 'text-warn' }
    case 'error':
      return { icon: CloudAlert, text: '同步失敗', cls: 'text-danger' }
    case 'dirty':
      return { icon: CloudUpload, text: '有未同步變更', cls: 'text-warn' }
    default:
      return {
        icon: Cloud,
        text: sync.lastSync ? `已同步 · ${formatRelative(sync.lastSync)}` : '已同步',
        cls: 'text-success',
      }
  }
})

async function onClick() {
  if (sync.status === 'off') return router.push('/settings#sync')
  if (sync.status === 'syncing') return
  try {
    await sync.syncNow(true)
    ui.toast('同步完成', 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : '同步失敗', 'error')
  }
}
</script>

<template>
  <button
    class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold"
    :class="view.cls"
    :title="sync.error ?? undefined"
    @click="onClick"
  >
    <component :is="view.icon" :size="14" :class="{ 'animate-spin': view.spin }" />
    <span class="whitespace-nowrap">{{ view.text }}</span>
  </button>
</template>
