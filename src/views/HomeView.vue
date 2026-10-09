<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Layers, Moon, Plus, Sun } from '@lucide/vue'
import SyncChip from '@/components/SyncChip.vue'
import NodeLegend from '@/components/NodeLegend.vue'
import NodeRow from '@/components/NodeRow.vue'
import NodeFormSheet from '@/components/NodeFormSheet.vue'
import StudyEntry from '@/components/StudyEntry.vue'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { childrenOf } from '@/lib/tree'
import { formatDayLabel, formatHour } from '@/lib/date'

const data = useData()
const settings = useSettings()

const roots = computed(() => childrenOf(data.nodes, null))
const stats = computed(() => data.scopeStats(null))
const progress = computed(() => data.scopeProgress(null))

const untilRollover = computed(() => {
  const ms = data.dayEnd - data.now
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`
})

const COLLAPSE_KEY = 'sr.collapsed'
const collapsed = ref(new Set<string>(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')))
function toggle(id: string) {
  const s = new Set(collapsed.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  collapsed.value = s
}
watch(collapsed, (s) => localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])))

const showForm = ref(false)
</script>

<template>
  <div>
    <header class="flex items-center justify-between gap-3 py-4">
      <SyncChip />
      <button
        class="icon-btn"
        :aria-label="settings.isDark ? '切換為淺色模式' : '切換為深色模式'"
        :title="settings.isDark ? '切換為淺色模式' : '切換為深色模式'"
        @click="settings.toggleDark()"
      >
        <Sun v-if="settings.isDark" :size="20" />
        <Moon v-else :size="20" />
      </button>
    </header>

    <section class="card mb-5 space-y-4">
      <div class="flex items-end justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-muted">學習日</p>
          <p class="text-2xl font-bold">{{ formatDayLabel(data.today) }}</p>
        </div>
        <div class="text-right text-xs text-muted">
          <p>換日時間 {{ formatHour(settings.synced.study.rolloverHour) }}</p>
          <p>還有 {{ untilRollover }}</p>
        </div>
      </div>
      <div>
        <div class="mb-1.5 flex justify-between text-xs font-semibold text-muted">
          <span>今日已複習 {{ progress.done }} 次</span>
          <span v-if="progress.ratio !== null">{{ Math.round(progress.ratio * 100) }}%</span>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div
            class="h-full rounded-full bg-primary transition-[width] duration-500"
            :style="{ width: `${Math.round((progress.ratio ?? 0) * 100)}%` }"
          />
        </div>
      </div>
      <StudyEntry :scope="null" />
      <p v-if="stats.drafts" class="text-xs text-muted">
        另有 {{ stats.drafts }} 張未完成的卡片不會進入學習。
      </p>
    </section>

    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-sm font-semibold tracking-wide text-muted uppercase">牌組</h2>
      <button v-if="roots.length" class="btn btn-ghost py-1.5" @click="showForm = true">
        <Plus :size="16" /> 新增
      </button>
    </div>

    <div v-if="!data.ready" class="py-10 text-center text-muted">載入中…</div>
    <div v-else-if="!roots.length" class="card flex flex-col items-center gap-3 py-10 text-center">
      <Layers :size="32" class="text-primary" />
      <p class="font-semibold">還沒有任何牌組</p>
      <p class="text-sm text-muted">先建立一個牌組開始吧！</p>
      <button class="btn btn-primary mt-2" @click="showForm = true">
        <Plus :size="18" /> 新增
      </button>
    </div>
    <div v-else class="card divide-y divide-line overflow-hidden p-0">
      <NodeLegend />
      <NodeRow v-for="n in roots" :key="n.id" :node="n" :collapsed="collapsed" @toggle="toggle" />
    </div>

    <NodeFormSheet v-model="showForm" :parent-id="null" />
  </div>
</template>
