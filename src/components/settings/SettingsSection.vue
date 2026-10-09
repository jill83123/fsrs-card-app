<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, RotateCcw } from '@lucide/vue'
import { useUi } from '@/stores/ui'

const props = defineProps<{
  id: string
  title: string
  icon: unknown
  /** short description of what is inside, shown under the title */
  hint?: string
  resettable?: boolean
}>()
const emit = defineEmits<{ reset: [] }>()
const ui = useUi()
const route = useRoute()

// links such as /settings#sync open their section directly
const open = ref(route.hash === `#${props.id}`)

async function reset() {
  if (await ui.confirm(`將「${props.title}」還原為預設值？`, { confirmText: '還原' })) {
    emit('reset')
    ui.toast('已還原預設', 'success')
  }
}
</script>

<template>
  <section :id="id" class="card scroll-mt-20 p-0">
    <button
      type="button"
      class="flex w-full items-center gap-3 p-5 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong dark:text-ink"
      >
        <component :is="icon" :size="18" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-lg font-bold">{{ title }}</span>
        <span v-if="hint" class="block truncate text-xs text-muted">{{ hint }}</span>
      </span>
      <ChevronDown
        :size="20"
        class="shrink-0 text-muted transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <div v-if="open" class="space-y-5 border-t border-line px-5 pt-5 pb-5">
      <slot />
      <div v-if="resettable" class="flex justify-end">
        <button class="pill pill-idle bg-surface-2 py-1.5 text-xs" @click="reset">
          <RotateCcw :size="13" /> 還原預設
        </button>
      </div>
    </div>
  </section>
</template>
