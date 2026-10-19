<script setup lang="ts">
import { computed } from 'vue'
import ChartTip from './ChartTip.vue'
import { useTip } from './useTip'

export interface Bar {
  key: string
  /** axis label under the bar; '' leaves the slot empty */
  label: string
  n: number
  /** shown in a floating bubble while the bar is hovered / tapped */
  tip: string
  strong?: boolean
}

const props = withDefaults(defineProps<{ bars: Bar[]; height?: number }>(), { height: 120 })

const max = computed(() => Math.max(1, ...props.bars.map((b) => b.n)))
// numbers above every bar only while they still fit
const showValues = computed(() => props.bars.length <= 10)
const { root, tip, show, hide } = useTip()
</script>

<template>
  <div ref="root" class="relative">
    <div
      class="flex items-end"
      :class="bars.length > 10 ? 'gap-[3px]' : 'gap-2'"
      @mouseleave="hide"
    >
      <div
        v-for="b in bars"
        :key="b.key"
        class="flex min-w-0 flex-1 cursor-default flex-col items-center gap-1"
        @mouseenter="show($event, b.tip)"
        @click="show($event, b.tip)"
      >
        <span v-if="showValues" class="text-xs font-semibold">{{ b.n }}</span>
        <div
          class="w-full rounded-t-[4px] transition-[height]"
          :class="[
            b.strong ? 'bg-primary' : 'bg-primary-soft',
            bars.length > 10 ? 'rounded-b-[2px]' : 'rounded-t-xl rounded-b-md',
          ]"
          :style="{ height: `${Math.max(3, (b.n / max) * height)}px` }"
        />
        <span class="h-4 overflow-visible text-[11px] whitespace-nowrap text-muted">{{
          b.label
        }}</span>
      </div>
    </div>
    <ChartTip :tip="tip" />
  </div>
</template>
