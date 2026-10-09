<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckSquare,
  Dumbbell,
  FolderInput,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  SlidersHorizontal,
  Star,
  StarOff,
  Trash2,
  X,
} from '@lucide/vue'
import CardListItem from './CardListItem.vue'
import CardFilterSheet from './CardFilterSheet.vue'
import MoveDeckSheet from './MoveDeckSheet.vue'
import type { Card } from '@/db/types'
import { activeFilterCount, applyFilter, defaultFilter, type CardFilter } from '@/lib/filter'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { canAutoReading, generateReading } from '@/lib/tts/autoReading'

const props = defineProps<{ cards: Card[]; showDeck?: boolean; storageKey?: string }>()
const data = useData()
const ui = useUi()
const router = useRouter()

function loadFilter(): CardFilter {
  if (!props.storageKey) return defaultFilter()
  try {
    const raw = sessionStorage.getItem(`sr.filter.${props.storageKey}`)
    return raw ? { ...defaultFilter(), ...JSON.parse(raw) } : defaultFilter()
  } catch {
    return defaultFilter()
  }
}

const filter = ref<CardFilter>(loadFilter())
watch(
  filter,
  (f) => {
    if (props.storageKey) sessionStorage.setItem(`sr.filter.${props.storageKey}`, JSON.stringify(f))
  },
  { deep: true },
)

const showFilter = ref(false)
const filtered = computed(() => applyFilter(props.cards, filter.value, data.scheduler, data.now))
const limit = ref(80)
const shown = computed(() => filtered.value.slice(0, limit.value))
const filterCount = computed(() => activeFilterCount(filter.value))

const selecting = ref(false)
const selected = ref(new Set<string>())
const selectedIds = computed(() =>
  filtered.value.filter((c) => selected.value.has(c.id)).map((c) => c.id),
)

function toggle(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}
function selectAll() {
  selected.value =
    selectedIds.value.length === filtered.value.length
      ? new Set()
      : new Set(filtered.value.map((c) => c.id))
}
function exitSelect() {
  selecting.value = false
  selected.value = new Set()
}

function onItem(c: Card) {
  if (selecting.value) toggle(c.id)
  else {
    try {
      sessionStorage.setItem('sr.browse.cards', JSON.stringify(filtered.value.map((x) => x.id)))
    } catch {
      /* browsing siblings is optional */
    }
    router.push(`/card/${c.id}`)
  }
}

async function patch(p: Parameters<typeof data.patchCards>[1], msg: string) {
  const ids = selectedIds.value
  if (!ids.length) return
  await data.patchCards(ids, p)
  ui.toast(`${msg} ${ids.length} 張`, 'success')
}

async function remove() {
  const ids = selectedIds.value
  if (!ids.length) return
  if (
    !(await ui.confirm(`刪除 ${ids.length} 張卡片？`, {
      danger: true,
      confirmText: '刪除',
      message: '複習紀錄也會一併失去作用。',
    }))
  )
    return
  await data.patchCards(ids, { deleted: true })
  exitSelect()
  ui.toast('已刪除', 'success')
}

async function reset() {
  const ids = selectedIds.value
  if (!ids.length) return
  if (
    !(await ui.confirm(`重設 ${ids.length} 張卡片的進度？`, {
      message: '卡片會回到「新卡」狀態。\n舊的複習紀錄會保留在統計中。',
      danger: true,
      confirmText: '重設',
    }))
  )
    return
  await data.resetCards(ids)
  ui.toast('已重設', 'success')
}

const showMove = ref(false)
async function moveTo(deckId: string) {
  await patch({ deckId }, '已移動')
  showMove.value = false
}

async function fillReadings() {
  const targets = filtered.value.filter(
    (c) => selected.value.has(c.id) && c.type === 'vocab' && !c.reading.trim() && canAutoReading(c.lang),
  )
  if (!targets.length) return ui.toast('選取的卡片沒有需要補讀音的單字', 'info')
  let done = 0
  for (const c of targets) {
    if (c.type !== 'vocab') continue
    const r = await generateReading(c.word, c.lang).catch(() => null)
    if (!r) continue
    await data.saveCard({ ...c, reading: r })
    done++
  }
  ui.toast(`已補上 ${done} / ${targets.length} 張的讀音`, done ? 'success' : 'error')
}

function practice() {
  const ids = selectedIds.value
  if (!ids.length) return
  sessionStorage.setItem('sr.practice.cards', JSON.stringify(ids))
  router.push({ path: '/practice', query: { pick: '1' } })
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center gap-2">
      <div class="relative flex-1">
        <Search :size="16" class="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input v-model="filter.q" class="input py-2 pl-10" placeholder="搜尋卡片" />
      </div>
      <button class="icon-btn relative" aria-label="篩選與排序" @click="showFilter = true">
        <SlidersHorizontal :size="18" />
        <span
          v-if="filterCount"
          class="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white"
        >
          {{ filterCount }}
        </span>
      </button>
      <button
        class="icon-btn"
        :class="{ 'bg-primary! text-white!': selecting }"
        aria-label="選取"
        @click="selecting ? exitSelect() : (selecting = true)"
      >
        <CheckSquare :size="18" />
      </button>
    </div>

    <div class="mb-2 flex items-center justify-between px-1 text-xs text-muted">
      <span>{{ filtered.length }} / {{ cards.length }} 張</span>
      <button v-if="selecting" class="font-semibold text-primary" @click="selectAll">
        {{ selectedIds.length === filtered.length && filtered.length ? '取消全選' : '全選' }}
      </button>
    </div>

    <div class="space-y-2">
      <CardListItem
        v-for="c in shown"
        :key="c.id"
        :card="c"
        :show-deck="showDeck"
        :selectable="selecting"
        :selected="selected.has(c.id)"
        @click="onItem(c)"
      />
      <button v-if="filtered.length > limit" class="btn btn-ghost w-full" @click="limit += 100">
        顯示更多（還有 {{ filtered.length - limit }} 張）
      </button>
      <p v-if="!filtered.length" class="py-8 text-center text-sm text-muted">沒有符合條件的卡片</p>
    </div>

    <Transition name="sheet">
      <div
        v-if="selecting"
        class="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div
          class="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl scrollbar-none"
        >
          <span class="px-3 text-sm font-bold whitespace-nowrap">{{ selectedIds.length }} 張</span>
          <button
            class="icon-btn size-10"
            title="加星號"
            @click="patch({ starred: true }, '已加星號')"
          >
            <Star :size="18" />
          </button>
          <button
            class="icon-btn size-10"
            title="取消星號"
            @click="patch({ starred: false }, '已取消星號')"
          >
            <StarOff :size="18" />
          </button>
          <button
            class="icon-btn size-10"
            title="暫停"
            @click="patch({ suspended: true }, '已暫停')"
          >
            <Pause :size="18" />
          </button>
          <button
            class="icon-btn size-10"
            title="恢復"
            @click="patch({ suspended: false }, '已恢復')"
          >
            <Play :size="18" />
          </button>
          <button
            class="icon-btn size-10"
            title="移動"
            @click="selectedIds.length && (showMove = true)"
          >
            <FolderInput :size="18" />
          </button>
          <button class="icon-btn size-10" title="自動補上讀音" @click="fillReadings">
            <Sparkles :size="18" />
          </button>
          <button class="icon-btn size-10" title="練習" @click="practice">
            <Dumbbell :size="18" />
          </button>
          <button class="icon-btn size-10" title="重設進度" @click="reset">
            <RotateCcw :size="18" />
          </button>
          <button class="icon-btn size-10 text-danger" title="刪除" @click="remove">
            <Trash2 :size="18" />
          </button>
          <button class="icon-btn size-10" title="結束選取" @click="exitSelect">
            <X :size="18" />
          </button>
        </div>
      </div>
    </Transition>

    <CardFilterSheet v-model="showFilter" v-model:filter="filter" />

    <MoveDeckSheet v-model="showMove" @pick="moveTo" />
  </div>
</template>
