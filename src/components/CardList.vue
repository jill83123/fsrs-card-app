<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import {
  activeFilterCount,
  applyFilter,
  defaultFilter,
  isSortKey,
  type CardFilter,
} from '@/lib/filter'
import { moved, useDragSort } from '@/composables/useDragSort'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { canAutoReading, generateReading } from '@/lib/tts/autoReading'

const props = defineProps<{ cards: Card[]; showDeck?: boolean; storageKey?: string }>()
const data = useData()
const ui = useUi()
const settings = useSettings()
const router = useRouter()

// the sort lives on the deck (synced); everything else in the filter is just for this visit
const savedSort = computed(() => {
  const s = props.storageKey ? data.nodeById.get(props.storageKey)?.cardSort : undefined
  return s && isSortKey(s.key) ? { key: s.key, desc: s.desc } : undefined
})

function loadFilter(): CardFilter {
  const base = defaultFilter()
  if (savedSort.value) {
    base.sort = savedSort.value.key
    base.desc = savedSort.value.desc
  }
  if (!props.storageKey) return base
  try {
    const raw = sessionStorage.getItem(`sr.filter.${props.storageKey}`)
    if (!raw) return base
    const rest = JSON.parse(raw)
    delete rest.sort
    delete rest.desc
    return { ...base, ...rest }
  } catch {
    return base
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
// save a changed sort to the deck, and follow it when another device changes it
watch(
  () => [filter.value.sort, filter.value.desc] as const,
  ([key, desc]) => {
    const s = savedSort.value
    if (!props.storageKey || (s ? s.key === key && s.desc === desc : key === 'created' && desc))
      return
    void data.updateNode(props.storageKey, { cardSort: { key, desc } })
  },
)
watch(savedSort, (s) => {
  if (s && (s.key !== filter.value.sort || s.desc !== filter.value.desc)) {
    filter.value.sort = s.key
    filter.value.desc = s.desc
  }
})

const showFilter = ref(false)
const sorted = computed(() => applyFilter(props.cards, filter.value, data.scheduler, data.now))

// hand-sorting: show the new order at once instead of waiting for the database round trip
const local = ref<string[] | null>(null)
watch(
  () => props.cards.map((c) => `${c.id}:${c.order ?? ''}`).join(),
  () => (local.value = null),
)
const filtered = computed(() => {
  if (!local.value) return sorted.value
  const byId = new Map(sorted.value.map((c) => [c.id, c]))
  return local.value.map((id) => byId.get(id)).filter((c): c is Card => !!c)
})
const limit = ref(80)
const shown = computed(() => filtered.value.slice(0, limit.value))
const filterCount = computed(() => activeFilterCount(filter.value))

const manual = computed(() => filter.value.sort === 'manual')
const dragReady = computed(
  () => manual.value && !selecting.value && !filterCount.value && !filter.value.q.trim(),
)
const drag = useDragSort((from, to) => {
  const ids = moved(
    filtered.value.map((c) => c.id),
    from,
    to,
  )
  local.value = ids
  void data.reorderCards(ids)
})

// press and hold a card to pick it up; moving before the hold ends is a normal scroll
const HOLD_MS = 350
let holdTimer = 0
let holdFrom = { x: 0, y: 0 }
let justHeld = false

function pressStart(e: PointerEvent, index: number) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const el = e.currentTarget as HTMLElement
  holdFrom = { x: e.clientX, y: e.clientY }
  clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => {
    justHeld = true
    holdTimer = 0
    navigator.vibrate?.(15)
    drag.start(e, index, el)
  }, HOLD_MS)
}
function pressMove(e: PointerEvent) {
  if (holdTimer && Math.hypot(e.clientX - holdFrom.x, e.clientY - holdFrom.y) > 8) pressCancel()
}
function pressCancel() {
  clearTimeout(holdTimer)
  holdTimer = 0
  // the click that ends a hold must not open the card
  setTimeout(() => (justHeld = false), 60)
}
// once a card is picked up the touch must not scroll the page
function blockScroll(e: TouchEvent) {
  if (drag.active() && e.cancelable) e.preventDefault()
}
onMounted(() => window.addEventListener('touchmove', blockScroll, { passive: false }))
onBeforeUnmount(() => window.removeEventListener('touchmove', blockScroll))

// same dashes as .leader, a touch darker than --line
const dash =
  'linear-gradient(to right, color-mix(in srgb, var(--line) 75%, var(--muted)) 3px, transparent 3px)'

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
  if (justHeld) return
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
  const res = await ui.confirmCheck(`重設 ${ids.length} 張卡片的進度？`, {
    message: '卡片會回到「尚未學習」狀態。',
    checkLabel: '同時刪除複習紀錄（統計也會一併移除）',
    danger: true,
    confirmText: '重設',
  })
  if (!res) return
  await data.resetCards(ids, res.checked)
  ui.toast('已重設', 'success')
}

const showMove = ref(false)
async function moveTo(deckId: string) {
  await patch({ deckId }, '已移動')
  showMove.value = false
}

async function fillReadings() {
  const targets = filtered.value.filter(
    (c) =>
      selected.value.has(c.id) && c.type === 'vocab' && !c.reading.trim() && canAutoReading(c.lang),
  )
  if (!targets.length) return ui.toast('選取的卡片沒有需要補讀音的單字', 'info')
  let done = 0
  for (const c of targets) {
    if (c.type !== 'vocab') continue
    const r = await generateReading(c.word, c.lang, settings.synced.reading.enStyle).catch(
      () => null,
    )
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
        <input v-model="filter.q" class="input pl-10" placeholder="搜尋卡片" />
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
      <p v-if="manual && !dragReady && !selecting" class="px-1 text-xs text-muted">
        清除搜尋與篩選後，才能拖拉調整順序
      </p>
      <div
        v-for="(c, i) in shown"
        :key="c.id"
        data-sort-item
        :class="drag.dragging(i) && 'rounded-xl shadow-lg'"
        :style="drag.style(i)"
      >
        <div
          v-if="i > 0 && i % 5 === 0"
          class="mb-2 flex items-center gap-2 pt-2 text-[11px] text-muted"
        >
          <span class="leader flex-1" :style="{ backgroundImage: dash }" />
          <span>{{ i }}</span>
          <span class="leader flex-1" :style="{ backgroundImage: dash }" />
        </div>
        <div
          :class="dragReady && 'select-none'"
          @pointerdown="dragReady && pressStart($event, i)"
          @pointermove="pressMove"
          @pointerup="pressCancel"
          @pointercancel="pressCancel"
          @contextmenu="dragReady && $event.preventDefault()"
        >
          <CardListItem
            :card="c"
            :show-deck="showDeck"
            :selectable="selecting"
            :selected="selected.has(c.id)"
            @click="onItem(c)"
          />
        </div>
      </div>
      <button v-if="filtered.length > limit" class="btn btn-ghost w-full" @click="limit += 100">
        顯示更多（還有 {{ filtered.length - limit }} 張）
      </button>
      <p v-if="!filtered.length" class="py-8 text-center text-sm text-muted">沒有符合條件的卡片</p>
    </div>

    <Transition name="sheet">
      <div
        v-if="selecting"
        class="fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))]"
      >
        <div
          class="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl scrollbar-none"
        >
          <span class="px-3 text-sm font-bold whitespace-nowrap">{{ selectedIds.length }} 張</span>
          <button class="icon-btn" title="加星號" @click="patch({ starred: true }, '已加星號')">
            <Star :size="18" />
          </button>
          <button
            class="icon-btn"
            title="取消星號"
            @click="patch({ starred: false }, '已取消星號')"
          >
            <StarOff :size="18" />
          </button>
          <button class="icon-btn" title="暫停" @click="patch({ suspended: true }, '已暫停')">
            <Pause :size="18" />
          </button>
          <button class="icon-btn" title="恢復" @click="patch({ suspended: false }, '已恢復')">
            <Play :size="18" />
          </button>
          <button class="icon-btn" title="移動" @click="selectedIds.length && (showMove = true)">
            <FolderInput :size="18" />
          </button>
          <button class="icon-btn" title="自動補上讀音" @click="fillReadings">
            <Sparkles :size="18" />
          </button>
          <button class="icon-btn" title="練習" @click="practice">
            <Dumbbell :size="18" />
          </button>
          <button class="icon-btn" title="重設進度" @click="reset">
            <RotateCcw :size="18" />
          </button>
          <button class="icon-btn text-danger" title="刪除" @click="remove">
            <Trash2 :size="18" />
          </button>
          <button class="icon-btn" title="結束選取" @click="exitSelect">
            <X :size="18" />
          </button>
        </div>
      </div>
    </Transition>

    <CardFilterSheet v-model="showFilter" v-model:filter="filter" />

    <MoveDeckSheet v-model="showMove" @pick="moveTo" />
  </div>
</template>
