<script setup lang="ts" generic="T extends string | number">
defineProps<{ options: { value: T; label: string }[]; size?: 'sm' | 'md' }>()
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
      class="min-w-0 flex-1 truncate rounded-lg px-2 font-medium transition-colors"
      :class="[
        model === o.value
          ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
          : 'text-muted hover:text-ink',
        size === 'sm' ? 'py-1.5 text-xs' : 'py-2 text-sm',
      ]"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
