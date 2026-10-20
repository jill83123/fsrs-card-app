<script setup lang="ts">
defineProps<{ tip: { text: string; x: number; y: number } | null }>()
</script>

<template>
  <div
    v-if="tip"
    class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full w-max max-w-60 rounded-lg bg-ink px-2.5 py-1 text-left text-xs font-semibold whitespace-pre-line text-surface shadow-lg"
    :style="{ left: `${tip.x}px`, top: `${tip.y - 6}px` }"
  >
    {{ tip.text }}
  </div>
</template>
