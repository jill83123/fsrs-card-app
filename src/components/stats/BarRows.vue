<script setup lang="ts">
import { computed } from 'vue'

export interface Row {
  label: string
  n: number
  color: string
}

const props = defineProps<{ rows: Row[] }>()

const total = computed(() => props.rows.reduce((a, r) => a + r.n, 0))
const max = computed(() => Math.max(1, ...props.rows.map((r) => r.n)))
const pct = (n: number) => (total.value ? Math.round((n / total.value) * 100) : 0)
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div v-for="r in rows" :key="r.label" class="flex items-center gap-3 text-sm">
      <span class="w-20 shrink-0 truncate text-muted">{{ r.label }}</span>
      <!-- the count sits at the end of its bar; leave room for it in the track -->
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <div
          class="h-3 shrink-0 rounded-r-[4px] rounded-l-[2px] transition-[width]"
          :style="{
            width: `calc((100% - 2.5rem) * ${r.n / max})`,
            background: r.color,
            minWidth: r.n ? '3px' : 0,
          }"
        />
        <span class="font-semibold tabular-nums">{{ r.n }}</span>
      </div>
      <span class="w-10 shrink-0 text-right text-xs text-muted tabular-nums">{{ pct(r.n) }}%</span>
    </div>
  </div>
</template>
