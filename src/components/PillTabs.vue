<script setup lang="ts" generic="T extends string | number">
import type { Component } from 'vue'
defineProps<{
  options: { value: T; label: string; icon?: Component }[]
  size?: 'sm' | 'md'
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <!-- segmented control -->
  <div class="flex w-full rounded-xl bg-surface-2 p-1" role="tablist">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="tab"
      :aria-selected="model === o.value"
      class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-medium transition-colors"
      :class="[
        model === o.value
          ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
          : 'text-muted hover:text-ink',
        size === 'sm' ? 'py-1.5 text-xs' : 'py-2 text-sm',
      ]"
      @click="model = o.value"
    >
      <component :is="o.icon" v-if="o.icon" :size="size === 'sm' ? 14 : 16" class="shrink-0" />
      <span class="truncate">{{ o.label }}</span>
    </button>
  </div>
</template>
