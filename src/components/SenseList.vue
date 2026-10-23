<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rows: { id: string; pos: string[]; meaning: string }[]
  large?: boolean
}>()

// short meanings sit in two columns split on the card's center line: parts of speech (as tags) end
// there on the left, meanings start there on the right, so the block stays balanced under the word.
// A long meaning would wrap in the narrow right half, and one without a part of speech would sit
// off to the right, so then each one is stacked and centered
const stacked = computed(() =>
  props.rows.some((r) => r.meaning.includes('\n') || r.meaning.length > 8 || !r.pos.length),
)
</script>

<template>
  <div v-if="stacked" class="space-y-3 text-center" :class="large ? 'text-xl' : 'text-lg'">
    <div v-for="s in rows" :key="s.id" class="space-y-1.5">
      <div v-if="s.pos.length" class="flex flex-wrap justify-center gap-1">
        <span v-for="p in s.pos" :key="p" class="chip">{{ p }}</span>
      </div>
      <p class="whitespace-pre-line">{{ s.meaning }}</p>
    </div>
  </div>
  <div
    v-else
    class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5"
    :class="large ? 'text-xl' : 'text-lg'"
  >
    <template v-for="s in rows" :key="s.id">
      <span class="flex flex-wrap justify-end gap-1">
        <span v-for="p in s.pos" :key="p" class="chip">{{ p }}</span>
      </span>
      <p class="text-left whitespace-pre-line">{{ s.meaning }}</p>
    </template>
  </div>
</template>
