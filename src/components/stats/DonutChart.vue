<script setup lang="ts">
import { computed, ref } from 'vue'

export interface Slice {
  label: string
  n: number
  color: string
}

const props = withDefaults(defineProps<{ slices: Slice[]; unit?: string }>(), { unit: '次' })

const total = computed(() => props.slices.reduce((a, s) => a + s.n, 0))
const pct = (n: number) => (total.value ? Math.round((n / total.value) * 100) : 0)

// arcs measured on a circle of pathLength 100, with a small surface gap between them
const GAP = 1
const arcs = computed(() => {
  const shown = props.slices.filter((s) => s.n)
  const gap = shown.length > 1 ? GAP : 0
  let offset = 0
  return shown.map((s) => {
    const len = (s.n / total.value) * 100
    const arc = {
      slice: s,
      // the gap outlasts the circle so the pattern never repeats into the start point
      dash: `${Math.max(0.01, len - gap)} 200`,
      offset: -offset,
    }
    offset += len
    return arc
  })
})

const hovered = ref<Slice | null>(null)
</script>

<template>
  <div class="flex items-center gap-5">
    <div class="relative size-32 shrink-0" @mouseleave="hovered = null">
      <svg viewBox="0 0 120 120" class="size-full -rotate-90">
        <circle cx="60" cy="60" r="48" fill="none" stroke="var(--surface-2)" stroke-width="18" />
        <circle
          v-for="a in arcs"
          :key="a.slice.label"
          cx="60"
          cy="60"
          r="48"
          fill="none"
          pathLength="100"
          :stroke="a.slice.color"
          :stroke-width="hovered === a.slice ? 22 : 18"
          :stroke-dasharray="a.dash"
          :stroke-dashoffset="a.offset"
          class="cursor-default transition-[stroke-width]"
          @mouseenter="hovered = a.slice"
          @click="hovered = a.slice"
        >
          <title>{{ a.slice.label }}：{{ a.slice.n }} {{ unit }}（{{ pct(a.slice.n) }}%）</title>
        </circle>
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span class="text-xl leading-tight font-bold tabular-nums">{{
          hovered ? `${pct(hovered.n)}%` : total
        }}</span>
        <span class="text-[11px] text-muted">{{ hovered ? hovered.label : `總${unit}數` }}</span>
      </div>
    </div>
    <div class="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-4">
      <div v-for="s in slices" :key="s.label" class="min-w-0">
        <div class="flex items-center gap-1.5 text-sm text-muted">
          <span class="size-2.5 shrink-0 rounded-full" :style="{ background: s.color }" />
          {{ s.label }}
        </div>
        <div class="mt-0.5 pl-4">
          <span class="text-lg font-bold tabular-nums">{{ s.n }}</span>
          <span class="ml-1 text-xs text-muted tabular-nums">{{ pct(s.n) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
