<script setup lang="ts">
import { computed } from 'vue'
import ChartTip from './ChartTip.vue'
import { useTip } from './useTip'
import { formatDayLabel, parseYmd } from '@/lib/date'

/** consecutive days, the first one being today */
const props = defineProps<{ days: { day: string; n: number }[] }>()

const max = computed(() => Math.max(1, ...props.days.map((d) => d.n)))
function level(n: number) {
  if (!n) return 0
  const r = n / max.value
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}
const levelColor = (l: number) =>
  l === 0
    ? 'var(--surface-2)'
    : `color-mix(in oklab, var(--primary) ${[0, 22, 42, 70, 100][l]}%, var(--surface-2))`

// weeks start on Monday; days outside the range stay as blank slots
const cells = computed(() => {
  const first = props.days[0]?.day
  if (!first) return []
  const lead = (parseYmd(first).getDay() + 6) % 7
  const out: ({ day: string; n: number; label: string; level: number } | null)[] = []
  for (let i = 0; i < lead; i++) out.push(null)
  props.days.forEach((d, i) => {
    const date = parseYmd(d.day)
    out.push({
      ...d,
      label:
        i === 0 || date.getDate() === 1
          ? `${date.getMonth() + 1}/${date.getDate()}`
          : String(date.getDate()),
      level: level(d.n),
    })
  })
  while (out.length % 7) out.push(null)
  return out
})

const { root, tip, show, hide } = useTip()
const isToday = (day: string) => day === props.days[0]?.day
const tipText = (day: string) => (isToday(day) ? '今天（含逾期）' : formatDayLabel(day))
// keep the label readable on the darkest steps
const strongText = (l: number) => l >= 3
</script>

<template>
  <div ref="root" class="relative">
    <div class="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
      <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{ w }}</span>
    </div>
    <div class="grid grid-cols-7 gap-1" @mouseleave="hide">
      <template v-for="(c, i) in cells" :key="c?.day ?? `blank-${i}`">
        <div v-if="!c" />
        <div
          v-else
          class="flex aspect-square min-w-0 cursor-default flex-col items-center justify-center rounded-lg leading-tight sm:aspect-[4/3]"
          :class="[
            isToday(c.day) && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
            strongText(c.level) ? 'text-white' : 'text-ink',
          ]"
          :style="{ background: levelColor(c.level) }"
          @mouseenter="show($event, tipText(c.day))"
          @click="show($event, tipText(c.day))"
        >
          <span class="text-[10px]" :class="strongText(c.level) ? 'text-white/80' : 'text-muted'">{{
            c.label
          }}</span>
          <span class="text-sm font-bold tabular-nums" :class="{ 'opacity-30': !c.n }">{{
            c.n
          }}</span>
        </div>
      </template>
    </div>
    <ChartTip :tip="tip" />
  </div>
</template>
