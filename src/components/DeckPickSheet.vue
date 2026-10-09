<script setup lang="ts">
import { computed } from 'vue'
import { Layers, Square, SquareCheck, SquareMinus } from '@lucide/vue'
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

function counts(deckId: string) {
  if (props.count === 'cards') return `${data.cardsByDeck.get(deckId)?.length ?? 0} 張`
  const s = data.decksStats([deckId])
  return `複習 ${s.dueAvail - s.learningWaiting} · 新卡 ${s.newAvail}`
}
</script>

<template>
  <BottomSheet v-model="open" title="選擇牌組">
    <div class="card divide-y divide-line overflow-hidden p-0">
      <button
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold"
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
      <button
        v-for="r in rows"
        :key="r.id"
        type="button"
        class="flex w-full items-center gap-3 py-3 pr-4 text-left text-sm"
        :style="{ paddingLeft: `${1 + r.depth * 1.25}rem` }"
        @click="toggle(r.decks)"
      >
        <component
          :is="icon[stateOf(r.decks)]"
          :size="20"
          class="shrink-0"
          :class="stateOf(r.decks) === 'none' ? 'text-muted' : 'text-primary'"
        />
        <Layers :size="16" class="shrink-0 text-muted" />
        <span class="min-w-0 flex-1 truncate font-medium">{{ r.name }}</span>
        <span v-if="!r.parent" class="shrink-0 text-xs text-muted tabular-nums">
          {{ counts(r.decks[0]!) }}
        </span>
      </button>
    </div>
    <button class="btn btn-primary mt-4 w-full" @click="open = false">完成</button>
  </BottomSheet>
</template>
