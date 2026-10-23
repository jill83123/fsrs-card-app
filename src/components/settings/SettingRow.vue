<script setup lang="ts">
/** `hint` as an array shows one short line per item */
defineProps<{
  label: string
  hint?: string | string[]
  stacked?: boolean
  /** stacked only: the hint goes under the control instead of under the label */
  hintBelow?: boolean
}>()
</script>

<template>
  <div :class="stacked ? 'space-y-2' : 'flex items-center justify-between gap-4'">
    <div class="min-w-0">
      <!-- #aside sits at the right end of the label line -->
      <div v-if="$slots.aside" class="flex items-center justify-between gap-3">
        <div class="text-sm font-semibold">{{ label }}</div>
        <slot name="aside" />
      </div>
      <div v-else class="text-sm font-semibold">{{ label }}</div>
      <div v-if="hint && !hintBelow" class="mt-1 space-y-0.5 text-xs text-muted">
        <p v-for="(h, i) in [hint].flat()" :key="i">{{ h }}</p>
      </div>
    </div>
    <slot />
    <div v-if="hint && hintBelow" class="space-y-0.5 text-xs text-muted">
      <p v-for="(h, i) in [hint].flat()" :key="i">{{ h }}</p>
    </div>
  </div>
</template>
