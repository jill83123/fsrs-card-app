<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface Bar {
  key: string
  /** axis label under the bar; '' leaves the slot empty */
  label: string
  n: number
  /** shown under the chart while the bar is hovered / tapped */
  title: string
  strong?: boolean
}

const props = withDefaults(defineProps<{ bars: Bar[]; height?: number }>(), { height: 120 })

const max = computed(() => Math.max(1, ...props.bars.map((b) => b.n)))
// numbers above every bar only while they still fit
const showValues = computed(() => props.bars.length <= 10)
const hovered = ref<Bar | null>(null)
watch(
  () => props.bars,
  () => (hovered.value = null),
)
</script>

<template>
  <div>
    <div
      class="flex items-end"
      :class="bars.length > 10 ? 'gap-[3px]' : 'gap-2'"
      @mouseleave="hovered = null"
    >
      <div
        v-for="b in bars"
        :key="b.key"
        class="flex min-w-0 flex-1 cursor-default flex-col items-center gap-1"
        :title="b.title"
        @mouseenter="hovered = b"
        @click="hovered = b"
      >
        <span v-if="showValues" class="text-xs font-semibold">{{ b.n }}</span>
        <div
          class="w-full rounded-t-[4px] transition-[height]"
          :class="[
            b.strong ? 'bg-primary' : 'bg-primary-soft',
            bars.length > 10 ? 'rounded-b-[2px]' : 'rounded-t-xl rounded-b-md',
            hovered === b && 'ring-1 ring-ink/40',
          ]"
          :style="{ height: `${Math.max(3, (b.n / max) * height)}px` }"
        />
        <span class="h-4 overflow-visible text-[11px] whitespace-nowrap text-muted">{{
          b.label
        }}</span>
      </div>
    </div>
    <p class="mt-2 text-xs text-muted">
      <template v-if="hovered">{{ hovered.title }}</template>
      <slot v-else />
    </p>
  </div>
</template>
