<script setup lang="ts">
import { X } from '@lucide/vue'

defineProps<{ title?: string }>()
const open = defineModel<boolean>({ required: true })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 bg-black/30" @click="open = false" />
    </Transition>
    <Transition name="sheet">
      <div
        v-if="open"
        class="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border-t border-line bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        @keydown.esc="open = false"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-lg font-bold">{{ title }}</h2>
          <button class="icon-btn size-9" aria-label="關閉" @click="open = false">
            <X :size="18" />
          </button>
        </div>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
