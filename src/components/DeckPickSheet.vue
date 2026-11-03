<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Square,
  SquareCheck,
  SquareMinus,
} from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import { useData } from '@/stores/data'
import { childrenOf, decksInScope } from '@/lib/tree'

const props = defineProps<{
  scope: string | null
  decks: string[]
  /** 'cards' shows each deck's card total instead of today's study counts */
  count?: 'study' | 'cards'
}>()
const open = defineModel<boolean>({ required: true })
/** Deck ids left out of study. */
const excluded = defineModel<Set<string>>('excluded', { required: true })
const data = useData()

const rows = computed(() => {
  const out: { id: string; name: string; depth: number; parent: boolean; decks: string[] }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(data.nodes, parentId)) {
      const decks = decksInScope(data.nodes, n.id)
      if (!decks.length) continue
      out.push({ id: n.id, name: n.name, depth, parent: decks.length > 1, decks })
      walk(n.id, depth + 1)
    }
  }
  walk(props.scope, 0)
  return out
})

// decks whose sub-decks are showing (everything starts folded)
const unfolded = ref(new Set<string>())
const isFolded = (id: string) => !unfolded.value.has(id)
function fold(id: string) {
  const s = new Set(unfolded.value)
  if (!s.delete(id)) s.add(id)
  unfolded.value = s
}
const parentIds = computed(() => rows.value.filter((r) => r.parent).map((r) => r.id))
const allUnfolded = computed(() => parentIds.value.every((id) => unfolded.value.has(id)))
function toggleAllFolds() {
  unfolded.value = allUnfolded.value ? new Set() : new Set(parentIds.value)
}
const visibleRows = computed(() => {
  const out: typeof rows.value = []
  let hideBelow = -1
  for (const r of rows.value) {
    if (hideBelow >= 0 && r.depth > hideBelow) continue
    hideBelow = -1
    out.push(r)
    if (r.parent && isFolded(r.id)) hideBelow = r.depth
  }
  return out
})

function stateOf(decks: string[]) {
  const n = decks.filter((id) => !excluded.value.has(id)).length
  return n === decks.length ? 'all' : n ? 'some' : 'none'
}

function toggle(decks: string[]) {
  const s = new Set(excluded.value)
  if (stateOf(decks) === 'all') decks.forEach((id) => s.add(id))
  else decks.forEach((id) => s.delete(id))
  excluded.value = s
}

const allState = computed(() => stateOf(props.decks))
const icon = { all: SquareCheck, some: SquareMinus, none: Square }

// a group adds up the decks under it
function counts(decks: string[]) {
  if (props.count === 'cards') {
    return `${decks.reduce((n, id) => n + (data.cardsByDeck.get(id)?.length ?? 0), 0)} 張`
  }
  const s = data.decksStats(decks)
  return `複習 ${s.dueAvail - s.learningWaiting} · 新卡 ${s.newAvail}`
}
</script>

<template>
  <BottomSheet v-model="open" title="選擇牌組">
    <div class="card divide-y divide-line overflow-hidden p-0">
      <div class="flex w-full items-center gap-1 pr-4 pl-2 text-sm font-semibold">
        <!-- fold or unfold every group at once, in the slot the fold buttons below use -->
        <span class="flex size-7 shrink-0 items-center justify-center">
          <button
            v-if="parentIds.length"
            type="button"
            class="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2"
            :aria-label="allUnfolded ? '全部收合' : '全部展開'"
            @click="toggleAllFolds"
          >
            <component
              :is="allUnfolded ? ChevronsDownUp : ChevronsUpDown"
              :size="16"
              :stroke-width="2.5"
            />
          </button>
        </span>
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
          @click="toggle(decks)"
        >
          <component
            :is="icon[allState]"
            :size="20"
            class="shrink-0"
            :class="allState === 'none' ? 'text-muted' : 'text-primary'"
          />
          全選
        </button>
      </div>
      <div
        v-for="r in visibleRows"
        :key="r.id"
        class="flex w-full items-center gap-1 pr-4 text-sm"
        :style="{ paddingLeft: `${0.5 + r.depth * 1.25}rem` }"
      >
        <!-- fold button; rows without sub-decks keep an empty slot so the checkboxes line up -->
        <span class="flex size-7 shrink-0 items-center justify-center">
          <button
            v-if="r.parent"
            type="button"
            class="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-2"
            :aria-label="isFolded(r.id) ? '展開' : '收合'"
            @click="fold(r.id)"
          >
            <ChevronDown
              :size="16"
              :stroke-width="2.5"
              class="transition-transform"
              :class="{ '-rotate-90': isFolded(r.id) }"
            />
          </button>
        </span>
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
          @click="toggle(r.decks)"
        >
          <component
            :is="icon[stateOf(r.decks)]"
            :size="20"
            class="shrink-0"
            :class="stateOf(r.decks) === 'none' ? 'text-muted' : 'text-primary'"
          />
          <span class="min-w-0 flex-1 truncate font-medium">{{ r.name }}</span>
          <span class="shrink-0 text-xs text-muted tabular-nums">{{ counts(r.decks) }}</span>
        </button>
      </div>
    </div>
    <button class="btn btn-primary mt-4 w-full" @click="open = false">完成</button>
  </BottomSheet>
</template>
