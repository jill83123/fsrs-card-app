<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="card">
    <div class="flex min-h-8.5 items-center justify-between gap-3">
      <h2 class="min-w-0 flex-1 truncate font-bold">{{ title }}</h2>
      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <div class="mt-4">
      <slot />
    </div>
  </section>
</template>
