<script setup lang="ts">
import { Check } from '@lucide/vue'
import { DECK_COLOR_KEYS, deckColorCss } from '@/db/defaults'
import type { DeckColor } from '@/db/types'

const model = defineModel<DeckColor>({ required: true })
</script>

<template>
  <div class="flex flex-wrap gap-3">
    <button
      v-for="c in DECK_COLOR_KEYS"
      :key="c"
      type="button"
      class="flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-bg transition"
      :class="model === c ? 'ring-2 ring-ink' : ''"
      :style="{ background: deckColorCss(c) }"
      :aria-label="c"
      @click="model = c"
    >
      <Check v-if="model === c" :size="18" class="text-ink/70" />
    </button>
  </div>
</template>
