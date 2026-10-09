<script setup lang="ts">
const model = defineModel<number>({ required: true })
const props = defineProps<{
  min: number
  max: number
  step: number
  /** values that get a tick mark under the track */
  ticks?: number[]
  /** values that get a text label (and a taller tick) */
  labels?: { value: number; label: string }[]
}>()

// keep in sync with --range-thumb in main.css: the thumb centre travels from
// half a thumb in from the left edge to half a thumb in from the right edge
const THUMB = 20
const frac = (v: number) => (v - props.min) / (props.max - props.min)
const pos = (v: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${frac(v)})`
const isLabelled = (v: number) => props.labels?.some((l) => l.value === v)
</script>

<template>
  <div>
    <input
      v-model.number="model"
      type="range"
      class="range"
      :min="min"
      :max="max"
      :step="step"
      :style="{ '--fill': pos(model) }"
    />
    <div class="relative h-2">
      <span
        v-for="t in ticks"
        :key="t"
        class="absolute top-0 w-px -translate-x-1/2"
        :class="isLabelled(t) ? 'h-2 bg-muted' : 'h-1.5 bg-line'"
        :style="{ left: pos(t) }"
      />
    </div>
    <div class="relative mt-0.5 h-4 text-[11px] text-muted">
      <button
        v-for="l in labels"
        :key="l.value"
        type="button"
        class="absolute top-0 -translate-x-1/2 whitespace-nowrap hover:text-ink"
        :class="{ 'font-semibold text-primary-strong': l.value === model }"
        :style="{ left: pos(l.value) }"
        @click="model = l.value"
      >
        {{ l.label }}
      </button>
    </div>
  </div>
</template>
