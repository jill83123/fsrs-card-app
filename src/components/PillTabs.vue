<script setup lang="ts" generic="T extends string | number">
import type { Component } from 'vue'
defineProps<{
  options: { value: T; label: string; icon?: Component }[]
  size?: 'sm' | 'md'
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <!-- separate bordered option buttons -->
  <div class="flex w-full gap-2" role="tablist">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="tab"
      :aria-selected="model === o.value"
      class="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-1.5 font-medium transition-colors"
      :class="[
        model === o.value
          ? 'border-primary bg-primary-soft text-primary-strong'
          : 'border-line bg-surface text-muted hover:text-ink',
        size === 'sm' ? 'py-2.5 text-xs' : 'py-3 text-sm',
      ]"
      @click="model = o.value"
    >
      <component :is="o.icon" v-if="o.icon" :size="size === 'sm' ? 14 : 16" class="shrink-0" />
      <span class="truncate">{{ o.label }}</span>
    </button>
  </div>
</template>
