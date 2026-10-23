<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '@/db/types'
import MarkdownView from './MarkdownView.vue'
import SpeakButton from './SpeakButton.vue'
import ExampleText from './ExampleText.vue'

// examples and note of a card, for the page that shows them beneath the card itself
const props = defineProps<{ card: Card }>()

const examples = computed(() =>
  props.card.type === 'vocab' ? props.card.examples.filter((e) => e.sentence.trim()) : [],
)
const note = computed(() => (props.card.type === 'vocab' ? props.card.note.trim() : ''))
</script>

<template>
  <section v-if="card.type === 'vocab' && examples.length" class="card mb-3">
    <h2 class="label">例句</h2>
    <div class="divide-y divide-line">
      <div v-for="(e, i) in examples" :key="e.id" class="py-3 first:pt-1 last:pb-0">
        <!-- the speaker lines up with the first line of the sentence -->
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-2">
              <span
                v-if="examples.length > 1"
                class="w-5 shrink-0 pt-1 text-xs font-bold tracking-[1px] text-muted/70"
              >
                #{{ i + 1 }}
              </span>
              <p class="flex-1"><ExampleText :sentence="e.sentence" :marks="e.marks" /></p>
            </div>
            <p
              v-if="e.translation"
              class="mt-1 text-sm text-muted"
              :class="{ 'pl-7': examples.length > 1 }"
            >
              {{ e.translation }}
            </p>
          </div>
          <SpeakButton :text="e.sentence" :lang="card.lang" class="-my-1.5 shrink-0" />
        </div>
      </div>
    </div>
  </section>
  <section v-if="card.type === 'vocab' && note" class="card mb-3">
    <h2 class="label">備註</h2>
    <MarkdownView :source="card.note" class="text-sm" />
  </section>
</template>
