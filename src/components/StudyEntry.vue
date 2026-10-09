<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Dumbbell, Layers, RotateCcw, Sparkles, Timer } from '@lucide/vue'
import DeckPickSheet from './DeckPickSheet.vue'
import { useData } from '@/stores/data'
import { useTicker } from '@/composables/useTicker'
import { formatCountdown } from '@/lib/date'
import { decksInScope } from '@/lib/tree'

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

const stats = computed(() =>
  partial.value ? data.decksStats(picked.value) : data.scopeStats(props.scope),
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
  <div class="grid grid-cols-3 gap-2">
    <button
      class="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-2.5 text-white transition active:scale-95 disabled:opacity-40"
      :disabled="!stats.dueAvail"
      @click="router.push({ path: '/study/review', query: q })"
    >
      <RotateCcw :size="16" class="shrink-0" />
      <span class="text-sm font-bold">複習</span>
      <span v-if="ready || !countdown" class="text-sm tabular-nums opacity-90">{{ ready }}</span>
      <span v-else class="text-xs tabular-nums opacity-90">{{ countdown }}</span>
    </button>
    <button
      class="flex items-center justify-center gap-1.5 rounded-xl bg-primary-soft px-2 py-2.5 text-primary-strong transition active:scale-95 disabled:opacity-40 dark:text-ink"
      :disabled="!stats.newAvail"
      @click="router.push({ path: '/study/learn', query: q })"
    >
      <Sparkles :size="16" class="shrink-0" />
      <span class="text-sm font-bold">新學習</span>
      <span class="text-sm tabular-nums opacity-80">{{ stats.newAvail }}</span>
    </button>
    <button
      class="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 px-2 py-2.5 text-ink transition active:scale-95 disabled:opacity-40"
      :disabled="!stats.total"
      @click="router.push({ path: '/practice', query: q })"
    >
      <Dumbbell :size="16" class="shrink-0" />
      <span class="text-sm font-bold">練習</span>
    </button>
  </div>
  <p v-if="ready && countdown" class="mt-2 flex items-center gap-1 text-xs tabular-nums text-muted">
    <Timer :size="12" class="shrink-0" />
    另有 {{ stats.learningWaiting }} 張學習中，{{ countdown }} 後可複習
  </p>
  <div v-if="$slots.default" class="mt-3"><slot /></div>
  <DeckPickSheet v-model="showPick" v-model:excluded="excluded" :scope="scope" :decks="allDecks" />
</template>
