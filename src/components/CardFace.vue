<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, MessageSquareQuote } from '@lucide/vue'
import type { Card, Example } from '@/db/types'
import MarkdownView from './MarkdownView.vue'
import SpeakButton from './SpeakButton.vue'
import DictLinks from './DictLinks.vue'
import { useSettings } from '@/stores/settings'
import { prefetchSpeech, speak } from '@/lib/tts'

const props = defineProps<{
  card: Card
  revealed: boolean
  /** vocab only: reverse = meaning → word */
  reverse?: boolean
}>()

const settings = useSettings()

const posLabels = computed(() => {
  if (props.card.type !== 'vocab') return []
  const opts = settings.synced.pos[props.card.lang]
  // options deleted from settings are skipped rather than shown as raw ids
  return props.card.pos.flatMap((id) => opts.find((o) => o.id === id)?.label ?? [])
})

const examples = computed<Example[]>(() =>
  props.card.type === 'vocab' ? props.card.examples.filter((e) => e.sentence.trim()) : [],
)

// a random example is picked each time a card is shown
const pick = ref(0)
const showExample = ref(false)
const showAllExamples = ref(false)

function reset() {
  pick.value = examples.value.length ? Math.floor(Math.random() * examples.value.length) : 0
  showExample.value = false
  showAllExamples.value = false
}
watch(() => [props.card.id, props.reverse], reset)

const picked = computed(() => examples.value[pick.value])
const others = computed(() => examples.value.filter((_, i) => i !== pick.value))

function autoPlay() {
  const c = props.card
  if (c.type !== 'vocab') return
  if (settings.device.tts.autoPlay && !props.reverse) {
    void speak(c.word, c.lang, settings.device.tts[c.lang], c.reading)
  } else {
    // slow voices (Kokoro) get a head start before the speaker is tapped
    prefetchSpeech(c.word, c.lang, settings.device.tts[c.lang], c.reading)
  }
}

function revealExample() {
  showExample.value = true
  const c = props.card
  if (c.type === 'vocab' && picked.value) {
    prefetchSpeech(picked.value.sentence, c.lang, settings.device.tts[c.lang])
  }
}
onMounted(() => {
  reset()
  autoPlay()
})
watch(() => [props.card.id, props.reverse], autoPlay)
watch(
  () => props.revealed,
  (r) => {
    const c = props.card
    if (r && c.type === 'vocab' && props.reverse && settings.device.tts.autoPlay) {
      void speak(c.word, c.lang, settings.device.tts[c.lang], c.reading)
    }
  },
)
</script>

<template>
  <!-- basic card -->
  <div v-if="card.type === 'basic'" class="space-y-5">
    <MarkdownView :source="card.front" class="text-lg" />
    <template v-if="revealed">
      <hr class="leader border-0" />
      <MarkdownView :source="card.back" class="text-lg" />
    </template>
  </div>

  <!-- vocab card -->
  <div v-else class="space-y-5">
    <!-- prompt side -->
    <div v-if="!reverse" class="flex flex-col items-center gap-2 text-center">
      <!-- mirrors the reading line below, so the word stays centered with or without a reading -->
      <div class="h-6" aria-hidden="true" />
      <div class="flex items-center gap-1">
        <!-- same width as the speak button, so the word itself sits in the center -->
        <span class="w-10 shrink-0" aria-hidden="true" />
        <span class="text-4xl font-bold break-all">{{ card.word }}</span>
        <SpeakButton :text="card.word" :lang="card.lang" :reading="card.reading" :size="22" />
      </div>
      <!-- always takes up a line so revealing / switching cards doesn't shift the layout -->
      <div class="min-h-6 text-muted">{{ revealed ? card.reading : '' }}</div>
    </div>
    <div v-else class="space-y-3 text-center">
      <!-- pos row and meaning keep a fixed minimum height whether or not they are filled in -->
      <div class="flex min-h-[1.625rem] flex-wrap justify-center gap-1.5">
        <span v-for="p in posLabels" :key="p" class="chip">{{ p }}</span>
      </div>
      <p class="min-h-14 text-xl whitespace-pre-line">{{ card.meaning }}</p>
    </div>

    <!-- example hint on the front -->
    <div v-if="!revealed && !reverse && picked" class="flex flex-col items-center">
      <button v-if="!showExample" class="btn btn-ghost text-sm" @click.stop="revealExample">
        <MessageSquareQuote :size="16" /> 查看例句
      </button>
      <div v-else class="flex w-full items-start gap-1 rounded-2xl bg-surface-2 px-4 py-3">
        <p class="flex-1">{{ picked.sentence }}</p>
        <SpeakButton :text="picked.sentence" :lang="card.lang" class="-my-1.5" />
      </div>
    </div>

    <!-- answer side -->
    <template v-if="revealed">
      <hr class="leader border-0" />
      <div v-if="reverse" class="flex flex-col items-center gap-1 text-center">
        <div class="h-6" aria-hidden="true" />
        <div class="flex items-center gap-1">
          <!-- same width as the speak button, so the word itself sits in the center -->
          <span class="w-10 shrink-0" aria-hidden="true" />
          <span class="text-3xl font-bold break-all">{{ card.word }}</span>
          <SpeakButton :text="card.word" :lang="card.lang" :reading="card.reading" :size="22" />
        </div>
        <div class="min-h-6 text-muted">{{ card.reading }}</div>
      </div>
      <div v-else class="space-y-3 text-center">
        <div class="flex min-h-[1.625rem] flex-wrap justify-center gap-1.5">
          <span v-for="p in posLabels" :key="p" class="chip">{{ p }}</span>
        </div>
        <p class="min-h-14 text-lg whitespace-pre-line">{{ card.meaning }}</p>
      </div>

      <div v-if="picked" class="space-y-2">
        <div class="rounded-2xl bg-surface-2 px-4 py-3">
          <div class="flex items-start gap-1">
            <p class="flex-1">{{ picked.sentence }}</p>
            <SpeakButton :text="picked.sentence" :lang="card.lang" class="-my-1.5" />
          </div>
          <p v-if="picked.translation" class="mt-1 text-sm text-muted">{{ picked.translation }}</p>
        </div>
        <template v-if="others.length">
          <button
            v-if="!showAllExamples"
            class="flex w-full items-center justify-center gap-1 py-1 text-sm font-semibold text-primary"
            @click.stop="showAllExamples = true"
          >
            查看更多例句（{{ others.length }}）<ChevronDown :size="16" />
          </button>
          <div v-else class="space-y-2">
            <div v-for="e in others" :key="e.id" class="rounded-2xl bg-surface-2 px-4 py-3">
              <div class="flex items-start gap-1">
                <p class="flex-1">{{ e.sentence }}</p>
                <SpeakButton :text="e.sentence" :lang="card.lang" class="-my-1.5" />
              </div>
              <p v-if="e.translation" class="mt-1 text-sm text-muted">{{ e.translation }}</p>
            </div>
          </div>
        </template>
      </div>

      <MarkdownView v-if="card.note.trim()" :source="card.note" class="text-sm text-muted" />
      <DictLinks :word="card.word" :lang="card.lang" />
    </template>
  </div>
</template>
