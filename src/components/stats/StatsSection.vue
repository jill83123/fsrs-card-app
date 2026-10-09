<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'

const props = defineProps<{ id: string; title: string }>()

// collapsed sections are remembered on this device; everything starts expanded
const STORE_KEY = 'sr.stats.collapsed'
const collapsedIds = ref(load())
function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
const collapsed = computed(() => collapsedIds.value.has(props.id))
function toggle() {
  // re-read so sections toggled elsewhere on the page are kept
  const s = load()
  if (s.has(props.id)) s.delete(props.id)
  else s.add(props.id)
  collapsedIds.value = s
  try {
    if (s.size) localStorage.setItem(STORE_KEY, JSON.stringify([...s]))
    else localStorage.removeItem(STORE_KEY)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="-my-1 flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        :aria-expanded="!collapsed"
        @click="toggle"
      >
        <h2 class="truncate font-bold">{{ title }}</h2>
        <ChevronDown
          :size="18"
          class="shrink-0 text-muted transition-transform"
          :class="{ '-rotate-90': collapsed }"
        />
      </button>
      <div v-if="$slots.actions && !collapsed" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="!collapsed" class="mt-4">
      <slot />
    </div>
  </section>
</template>
