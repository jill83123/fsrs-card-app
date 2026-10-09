<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '@/db/types'
import { isComplete } from '@/lib/cards'
import { State, STATE_LABEL } from '@/lib/fsrs'
import { STATE_COLORS } from './colors'

const props = defineProps<{
  cards: Card[]
  /** thin bar, smaller legend without empty states */
  compact?: boolean
}>()

const segments = computed(() => {
  const m = new Map<string, number>()
  const inc = (k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const c of props.cards) {
    if (c.suspended) inc('suspended')
    else if (!isComplete(c)) inc('draft')
    else inc(String(c.sched.state))
  }
  const states = [State.New, State.Learning, State.Review, State.Relearning]
  return [
    ...states.map((s) => ({
      key: String(s),
      label: STATE_LABEL[s],
      n: m.get(String(s)) ?? 0,
      color: STATE_COLORS[s],
    })),
    { key: 'suspended', label: '暫停', n: m.get('suspended') ?? 0, color: 'var(--muted)' },
    { key: 'draft', label: '未完成', n: m.get('draft') ?? 0, color: 'var(--line)' },
  ]
})
</script>

<template>
  <div>
    <div
      v-if="cards.length"
      class="flex gap-[2px] overflow-hidden"
      :class="compact ? 'mb-2 h-1.5 rounded-full' : 'mb-3 h-3 rounded-[4px]'"
    >
      <div
        v-for="s in segments.filter((x) => x.n)"
        :key="s.key"
        :style="{ flexGrow: s.n, background: s.color }"
        :title="`${s.label}：${s.n} 張`"
      />
    </div>
    <div
      class="flex flex-wrap"
      :class="compact ? 'gap-x-3 gap-y-1 text-xs' : 'gap-x-5 gap-y-1.5 text-sm'"
    >
      <div
        v-for="s in compact ? segments.filter((x) => x.n) : segments"
        :key="s.key"
        class="flex items-center gap-1.5"
      >
        <span
          class="shrink-0 rounded-full"
          :class="compact ? 'size-2' : 'size-2.5'"
          :style="{ background: s.color }"
        />
        <span class="text-muted">{{ s.label }}</span>
        <span class="font-semibold tabular-nums">{{ s.n }}</span>
      </div>
    </div>
  </div>
</template>
