<script setup lang="ts">
import { computed } from 'vue'
import { Shuffle, Square, SquareCheck } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import PillTabs from './PillTabs.vue'
import { useData } from '@/stores/data'
import { cardSubtitle, cardTitle, isStudyable, schedOf, type Side } from '@/lib/cards'
import { State } from '@/lib/fsrs'
import { ymd } from '@/lib/date'
import { emptyPick, toFilter, type NewPick } from '@/lib/newPick'
import { newKeys } from '@/lib/session'
import type { Card } from '@/db/types'

const props = defineProps<{ decks: string[] }>()
const emit = defineEmits<{ start: [] }>()
const open = defineModel<boolean>({ required: true })
const pick = defineModel<NewPick>('pick', { required: true })
const data = useData()

const LIST_MAX = 300

const activeDecks = computed(() => props.decks.filter((id) => !data.pausedIds.has(id)))

/** Cards that still have a new side, with those sides. */
const candidates = computed(() => {
  const out: { card: Card; sides: Side[] }[] = []
  for (const deckId of activeDecks.value) {
    for (const card of data.cardsByDeck.get(deckId) ?? []) {
      if (!isStudyable(card)) continue
      const sides = data.sidesOf(card).filter((s) => schedOf(card, s).state === State.New)
      if (sides.length) out.push({ card, sides })
    }
  }
  return out.sort((a, b) => a.card.createdAt - b.card.createdAt)
})

const hasReverse = computed(() => candidates.value.some((x) => x.sides.includes('r')))

const visible = computed(() =>
  candidates.value.filter((x) => pick.value.side === 'all' || x.sides.includes(pick.value.side)),
)

const newInput = computed(() => ({
  cardsByDeck: data.cardsByDeck,
  limitsOf: data.limitsOf,
  doneToday: data.doneToday,
  newOrder: 'created' as const,
  sidesOf: data.sidesOf,
}))

/** What is ticked until the user changes it: the cards inside each deck's daily limit. */
const defaultIds = computed(() => {
  const ids = new Set<string>()
  for (const id of activeDecks.value)
    for (const k of newKeys(id, newInput.value, { side: pick.value.side }))
      ids.add(k.endsWith(':r') ? k.slice(0, -2) : k)
  return ids
})
const chosenSet = computed(() => new Set(pick.value.chosen ?? defaultIds.value))

/** Number of side-cards that will be learned. */
const willLearn = computed(() => {
  const f = toFilter({ ...pick.value, chosen: [...chosenSet.value] })
  return activeDecks.value.reduce((n, id) => n + newKeys(id, newInput.value, f).length, 0)
})

// the daily limit is only a hint: more can be chosen, shown in red
const limitInfo = computed(() => {
  let limit = 0
  let done = 0
  let room = 0
  for (const id of activeDecks.value) {
    const l = data.limitsOf(id).newPerDay
    const d = data.doneToday.get(id)?.newDone ?? 0
    limit += l
    done += d
    room += Math.max(0, l - d)
  }
  // the reverse side is not limited per day
  const chosen = visible.value.filter((x) => chosenSet.value.has(x.card.id))
  const forward = chosen.filter((x) => x.sides.includes('f') && pick.value.side !== 'r').length
  const reverse = chosen.filter((x) => x.sides.includes('r') && pick.value.side !== 'f').length
  return { limit, done, room, forward, reverse, over: Math.max(0, forward - room) }
})

/** grey while under the limit, green when it is met, red when over */
const forwardTone = computed(() => {
  const { forward, room, over } = limitInfo.value
  return over ? 'font-semibold text-danger' : forward === room ? 'font-semibold text-success' : ''
})

function choose(ids: Iterable<string>) {
  pick.value = { ...pick.value, chosen: [...ids] }
}

function toggleCard(id: string) {
  const s = new Set(chosenSet.value)
  if (!s.delete(id)) s.add(id)
  choose(s)
}

const chosenCount = computed(
  () => visible.value.filter((x) => chosenSet.value.has(x.card.id)).length,
)
const allOn = computed(() => visible.value.every((x) => chosenSet.value.has(x.card.id)))

function toggleAll() {
  const s = new Set(chosenSet.value)
  for (const x of visible.value) {
    if (allOn.value) s.delete(x.card.id)
    else s.add(x.card.id)
  }
  choose(s)
}

/** Draw a fresh random set of cards, as many as each deck's daily limit allows. */
function pickRandom() {
  const ids = new Set<string>()
  for (const id of activeDecks.value)
    for (const k of newKeys(
      id,
      { ...newInput.value, newOrder: 'random' },
      { side: pick.value.side },
    ))
      ids.add(k.endsWith(':r') ? k.slice(0, -2) : k)
  choose(ids)
}

function setSide(side: NewPick['side']) {
  // the default depends on the direction, so start from it again
  pick.value = { side, chosen: null }
}

/** a reverse card is asked from the meaning, so the list shows that instead of giving the word away */
const listTitle = (x: { card: Card; sides: Side[] }) =>
  x.card.type === 'vocab' &&
  (pick.value.side === 'r' || (x.sides.length === 1 && x.sides[0] === 'r'))
    ? cardSubtitle(x.card)
    : cardTitle(x.card)

const sideLabel = (sides: Side[]) =>
  sides.length === 2 ? '正向＋反向' : sides[0] === 'r' ? '反向' : ''
</script>

<template>
  <BottomSheet v-model="open" title="選擇新學習的卡片">
    <div class="space-y-4">
      <div v-if="hasReverse">
        <label class="label">方向</label>
        <PillTabs
          :model-value="pick.side"
          size="sm"
          :options="[
            { value: 'all', label: '全部' },
            { value: 'f', label: '單字 → 意思' },
            { value: 'r', label: '意思 → 單字' },
          ]"
          @update:model-value="setSide($event as NewPick['side'])"
        />
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label class="label mb-0">卡片（已選 {{ chosenCount }} / {{ visible.length }}）</label>
          <div v-if="visible.length" class="flex items-center gap-3">
            <button
              type="button"
              class="flex items-center gap-1 text-xs font-semibold text-primary"
              @click="pickRandom"
            >
              <Shuffle :size="14" />
              隨機
            </button>
            <button type="button" class="text-xs font-semibold text-primary" @click="toggleAll">
              {{ allOn ? '全部取消' : '全選' }}
            </button>
          </div>
        </div>
        <div class="mb-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-muted">
          <p>
            每日上限 {{ limitInfo.limit }}，已學 {{ limitInfo.done }}，還可學 {{ limitInfo.room
            }}<template v-if="hasReverse">（反向不計上限）</template>
          </p>
          <p v-if="hasReverse || limitInfo.over" class="ml-auto">
            已選：<span :class="forwardTone">正向 {{ limitInfo.forward }}</span>
            <span v-if="limitInfo.over" :class="forwardTone">（超過 {{ limitInfo.over }}）</span>
            <template v-if="hasReverse">、反向 {{ limitInfo.reverse }}</template>
          </p>
        </div>
        <p v-if="!visible.length" class="card text-center text-sm text-muted">沒有符合的新卡</p>
        <div v-else class="card max-h-72 divide-y divide-line overflow-y-auto p-0">
          <button
            v-for="x in visible.slice(0, LIST_MAX)"
            :key="x.card.id"
            type="button"
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
            @click="toggleCard(x.card.id)"
          >
            <component
              :is="chosenSet.has(x.card.id) ? SquareCheck : Square"
              :size="20"
              class="shrink-0"
              :class="chosenSet.has(x.card.id) ? 'text-primary' : 'text-muted'"
            />
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span class="truncate text-sm font-medium">{{ listTitle(x) }}</span>
              <span
                v-if="sideLabel(x.sides)"
                class="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted"
              >
                {{ sideLabel(x.sides) }}
              </span>
            </span>
            <span class="shrink-0 text-xs text-muted tabular-nums">
              {{ ymd(new Date(x.card.createdAt)) }}
            </span>
          </button>
          <p v-if="visible.length > LIST_MAX" class="px-4 py-2 text-center text-xs text-muted">
            只顯示前 {{ LIST_MAX }} 張
          </p>
        </div>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <button class="btn btn-ghost" @click="pick = emptyPick()">重設</button>
      <button
        class="btn btn-primary flex-1"
        :disabled="!willLearn"
        @click="((open = false), emit('start'))"
      >
        開始學習
      </button>
    </div>
  </BottomSheet>
</template>
