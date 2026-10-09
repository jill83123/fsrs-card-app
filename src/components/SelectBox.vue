<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

defineOptions({ inheritAttrs: false })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = defineModel<any>()
</script>

<template>
  <div class="relative w-full">
    <select v-model="model" class="input cursor-pointer appearance-none pr-10" v-bind="$attrs">
      <slot />
    </select>
    <ChevronDown
      :size="18"
      class="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
    />
  </div>
</template>
