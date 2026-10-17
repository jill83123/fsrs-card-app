<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Dumbbell, Layers, RotateCcw, Sparkles, Timer } from '@lucide/vue'
import DeckPickSheet from './DeckPickSheet.vue'
import { useData } from '@/stores/data'
import { useTicker } from '@/composables/useTicker'
import { formatCountdown } from '@/lib/date'
import { decksInScope } from '@/lib/tree'
import { emptyPick, setPick, type NewPick } from '@/lib/newPick'
import NewPickSheet from './NewPickSheet.vue'

const props = defineProps<{ scope: string | null }>()
const data = useData()
const router = useRouter()

// decks left out of study are remembered per scope on this device
const allDecks = computed(() => decksInScope(data.nodes, props.scope))
const storeKey = computed(() => `sr.deckpick.${props.scope ?? '*'}`)
const excluded = ref(new Set<string>())
watch(
  storeKey,
  (k) => {
    try {
      excluded.value = new Set(JSON.parse(localStorage.getItem(k) ?? '[]') as string[])
    } catch {
      excluded.value = new Set()
    }
  },
  { immediate: true },
)
watch(excluded, (s) => {
  try {
    if (s.size) localStorage.setItem(storeKey.value, JSON.stringify([...s]))
    else localStorage.removeItem(storeKey.value)
  } catch {
    /* ignore */
  }
})
const picked = computed(() => allDecks.value.filter((id) => !excluded.value.has(id)))
const partial = computed(() => picked.value.length < allDecks.value.length)
// count only decks that can hold cards (parent decks never do)
const pickable = computed(() =>
  allDecks.value.filter((id) => !data.nodes.some((n) => n.parentId === id)),
)
const pickedCount = computed(() => pickable.value.filter((id) => !excluded.value.has(id)).length)
const showPick = ref(false)
const soleDeckName = computed(
  () => data.nodes.find((n) => n.id === pickable.value[0])?.name ?? '此牌組',
)

// which new cards to learn: chosen in the sheet each time, starting from the default
const pick = ref<NewPick>(emptyPick())
const showNewPick = ref(false)
watch(showNewPick, (open) => open && (pick.value = emptyPick()))

const stats = computed(() =>
  partial.value ? data.decksStats(picked.value) : data.scopeStats(props.scope),
)
// only once today's allowance of a kind is used up; cards beyond it are not worth mentioning before
const limitReached = computed(
  () =>
    (stats.value.dueOver > 0 && !stats.value.dueAvail) ||
    (stats.value.newOver > 0 && !stats.value.newAvail),
)
const q = computed(() => ({
  ...(props.scope ? { scope: props.scope } : {}),
  ...(partial.value ? { decks: picked.value.join(',') } : {}),
}))

// learning cards due later today are reviewable only once their step has elapsed
const now = useTicker()
const ready = computed(() => stats.value.dueAvail - stats.value.learningWaiting)
const countdown = computed(() =>
  stats.value.learningWaiting ? formatCountdown(stats.value.nextDue - now.value) : '',
)
const allCountdown = computed(() =>
  stats.value.learningWaiting ? formatCountdown(stats.value.lastDue - now.value) : '',
)
</script>

<template>
  <button
    v-if="pickable.length > 1"
    type="button"
    class="mb-2 flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
    @click="showPick = true"
  >
    <Layers :size="14" class="shrink-0" />
    學習範圍：{{ partial ? `${pickedCount} / ${pickable.length} 個牌組` : '全部' }}
    <ChevronRight :size="14" class="shrink-0" />
  </button>
  <p
    v-else-if="pickable.length === 1"
    class="mb-2 flex items-center gap-1 text-xs font-medium text-muted"
  >
    <Layers :size="14" class="shrink-0" />
    學習範圍：{{ soleDeckName }}
  </p>
  <div class="grid grid-cols-3 gap-2">
    <button
      class="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-primary px-1 py-2.5 text-white transition active:scale-95 disabled:opacity-40"
      :disabled="!stats.dueAvail && !stats.dueOver"
      @click="router.push({ path: '/study/review', query: q })"
    >
      <RotateCcw :size="16" class="shrink-0" />
      <span class="text-sm font-bold">複習</span>
      <span v-if="ready || !countdown" class="text-sm tabular-nums opacity-90">{{ ready }}</span>
      <span v-else class="text-xs tabular-nums opacity-90">{{ countdown }}</span>
    </button>
    <button
      class="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-primary-soft px-1 py-2.5 text-primary-strong transition active:scale-95 disabled:opacity-40 dark:text-ink"
      :disabled="!stats.newAvail && !stats.newOver"
      @click="showNewPick = true"
    >
      <Sparkles :size="16" class="shrink-0" />
      <span class="text-sm font-bold">新學習</span>
      <span class="text-sm tabular-nums opacity-80">{{ stats.newAvail }}</span>
    </button>
    <button
      class="flex items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-surface-2 px-1 py-2.5 text-ink transition active:scale-95 disabled:opacity-40"
      :disabled="!stats.total"
      @click="router.push({ path: '/practice', query: q })"
    >
      <Dumbbell :size="16" class="shrink-0" />
      <span class="text-sm font-bold">練習</span>
    </button>
  </div>
  <p
    v-if="countdown"
    class="mt-2! flex items-center gap-1 text-xs tabular-nums text-muted"
  >
    <Timer :size="12" class="shrink-0" />
    {{ stats.learningWaiting }} 張卡片等待中，{{ allCountdown }} 後可複習全部
  </p>
  <p v-if="limitReached" class="mt-2! text-xs text-muted">
    已達每日上限，還有 <template v-if="stats.dueOver">{{ stats.dueOver }} 張複習卡片</template
    ><template v-if="stats.dueOver && stats.newOver">、</template
    ><template v-if="stats.newOver">{{ stats.newOver }} 張新卡片</template>可繼續
  </p>
  <div v-if="$slots.default" class="mt-3"><slot /></div>
  <NewPickSheet
    v-model="showNewPick"
    v-model:pick="pick"
    :decks="picked"
    @start="(setPick(scope, pick), router.push({ path: '/study/learn', query: q }))"
  />
  <DeckPickSheet v-model="showPick" v-model:excluded="excluded" :scope="scope" :decks="allDecks" />
</template>
