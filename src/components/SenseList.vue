<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rows: { id: string; pos: string[]; meaning: string }[]
  large?: boolean
}>()

// meanings sit in two columns (parts of speech as tags on the left, meanings on the right) and
// the whole block is centered under the word; a long meaning wraps inside its own column. One
// without a part of speech would leave its column empty, and one with line breaks reads badly
// beside a tag, so then each one is stacked and centered (tags above the meaning)
const stacked = computed(() => props.rows.some((r) => r.meaning.includes('\n') || !r.pos.length))
</script>

<template>
  <div v-if="stacked" class="space-y-3 text-center" :class="large ? 'text-lg' : 'text-base'">
    <div v-for="s in rows" :key="s.id" class="space-y-1.5">
      <div v-if="s.pos.length" class="flex flex-wrap justify-center gap-1">
        <span v-for="p in s.pos" :key="p" class="chip">{{ p }}</span>
      </div>
      <p class="whitespace-pre-line">{{ s.meaning }}</p>
    </div>
  </div>
  <!-- as wide as its content but never wider than the space there is, so a long meaning wraps in
       its own column instead of spilling out or running under the tags -->
  <div v-else class="flex justify-center" :class="large ? 'text-lg' : 'text-base'">
    <div class="grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
      <template v-for="s in rows" :key="s.id">
        <span class="flex flex-wrap justify-end gap-1">
          <span v-for="p in s.pos" :key="p" class="chip">{{ p }}</span>
        </span>
        <p class="text-left whitespace-pre-line">{{ s.meaning }}</p>
      </template>
    </div>
  </div>
</template>
