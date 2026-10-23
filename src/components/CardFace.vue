<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, Lightbulb, MessageSquareQuote } from '@lucide/vue'
import type { Card, Example } from '@/db/types'
import MarkdownView from './MarkdownView.vue'
import SpeakButton from './SpeakButton.vue'
import DictLinks from './DictLinks.vue'
import SenseList from './SenseList.vue'
import ExampleText from './ExampleText.vue'
import { useSettings } from '@/stores/settings'
import { sensesOf } from '@/lib/cards'
import { prefetchSpeech, speak } from '@/lib/tts'

const props = defineProps<{
  card: Card
  revealed: boolean
  /** vocab only: reverse = meaning → word */
  reverse?: boolean
  /** the examples, note and dictionary links are shown elsewhere (CardExamples), not on the card */
  listExamples?: boolean
}>()

const settings = useSettings()

// every meaning with its parts of speech
const senseRows = computed(() => {
  const c = props.card
  if (c.type !== 'vocab') return []
  const opts = settings.synced.pos[c.lang]
  // options deleted from settings are skipped rather than shown as raw ids
  return sensesOf(c).map((s) => ({
    id: s.id,
    pos: s.pos.flatMap((id) => opts.find((o) => o.id === id)?.label ?? []),
    meaning: s.meaning,
  }))
})

const examples = computed<Example[]>(() =>
  props.card.type === 'vocab' ? props.card.examples.filter((e) => e.sentence.trim()) : [],
)

// a random example is picked each time a card is shown
const pick = ref(0)
const showExample = ref(false)
const showAllExamples = ref(false)
const showHint = ref(false)

// reverse front: first letter + one blank per remaining letter, spaces kept.
// Japanese hints from the reading, so kanji aren't given away and length means sounds
const wordHint = computed(() => {
  const c = props.card
  if (c.type !== 'vocab') return []
  const source = c.lang === 'ja' && c.reading?.trim() ? c.reading.replace(/\s+/g, '') : c.word
  // words → slots; a slot is the revealed first letter, or '' for a blank
  return source
    .trim()
    .split(/\s+/)
    .map((w) => Array.from(w).map((ch, i) => (i === 0 ? ch : '')))
})

function reset() {
  pick.value =
    examples.value.length && !props.listExamples
      ? Math.floor(Math.random() * examples.value.length)
      : 0
  showExample.value = false
  showAllExamples.value = false
  showHint.value = false
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
  <!-- detail page: the divider is the middle of the card, so the page's arrows can line up with it -->
  <div v-if="listExamples" class="grid h-full grid-rows-[1fr_auto_1fr] text-center">
    <!-- before the answer, a card is just its front, centered on the card -->
    <div
      class="flex flex-col items-center gap-1 self-end transition-transform"
      :class="!revealed ? 'translate-y-1/2' : 'pb-5'"
    >
      <MarkdownView v-if="card.type === 'basic'" :source="card.front" class="text-2xl font-bold" />
      <template v-else>
        <div class="flex items-center gap-1">
          <!-- same width as the speak button, so the word itself sits in the center -->
          <span class="w-10 shrink-0" aria-hidden="true" />
          <span class="text-4xl font-bold break-all">{{ card.word }}</span>
          <SpeakButton :text="card.word" :lang="card.lang" :reading="card.reading" :size="22" />
        </div>
        <div v-if="revealed" class="min-h-6 text-muted">{{ card.reading }}</div>
      </template>
    </div>
    <!-- inset a little, so the line stops short of the page's arrows instead of running into them -->
    <hr class="leader mx-4 border-0" :class="{ invisible: !revealed }" />
    <!-- as tall as the word and reading above, with the meaning in its middle, so the content
         is balanced on both sides of the divider -->
    <div class="flex min-h-28 flex-col items-center justify-center gap-3 self-start pt-5">
      <template v-if="card.type === 'basic'">
        <MarkdownView v-if="revealed" :source="card.back" class="text-lg" />
      </template>
      <template v-else-if="revealed">
        <SenseList :rows="senseRows" />
      </template>
    </div>
  </div>

  <!-- basic card -->
  <div v-else-if="card.type === 'basic'" class="space-y-5">
    <MarkdownView :source="card.front" class="text-2xl font-bold" />
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
    <div v-else class="min-h-24 space-y-4 text-center">
      <SenseList :rows="senseRows" large />
    </div>

    <!-- word hint on the reverse front: only shown after tapping -->
    <div v-if="!revealed && reverse" class="flex flex-col items-center">
      <button v-if="!showHint" class="btn btn-ghost text-sm" @click.stop="showHint = true">
        <Lightbulb :size="16" /> 查看提示
      </button>
      <div
        v-else
        class="flex w-full flex-wrap items-end justify-center gap-x-6 gap-y-2 rounded-2xl bg-surface-2 px-4 py-3"
      >
        <span v-for="(w, wi) in wordHint" :key="wi" class="flex items-end gap-1.5">
          <span
            v-for="(ch, ci) in w"
            :key="ci"
            class="inline-flex h-9 min-w-5 pb-1 items-end justify-center border-b-2 border-muted/50 text-2xl leading-none font-semibold"
          >
            {{ ch }}
          </span>
        </span>
      </div>
    </div>

    <!-- example hint on the front -->
    <div v-if="!revealed && !reverse && picked" class="flex flex-col items-center">
      <button v-if="!showExample" class="btn btn-ghost text-sm" @click.stop="revealExample">
        <MessageSquareQuote :size="16" /> 查看例句
      </button>
      <div v-else class="flex w-full items-start gap-1 rounded-2xl bg-surface-2 px-4 py-3">
        <p class="flex-1">
          <ExampleText :sentence="picked.sentence" :marks="picked.marks" />
        </p>
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
      <div v-else class="min-h-[4.5rem] space-y-3 text-center">
        <SenseList :rows="senseRows" />
      </div>

      <div v-if="picked" class="space-y-2">
        <!-- the speaker lines up with the first line of the sentence -->
        <div class="flex items-start gap-1 rounded-2xl bg-surface-2 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p><ExampleText :sentence="picked.sentence" :marks="picked.marks" /></p>
            <p v-if="picked.translation" class="mt-1 text-sm text-muted">
              {{ picked.translation }}
            </p>
          </div>
          <SpeakButton :text="picked.sentence" :lang="card.lang" class="-my-1.5 shrink-0" />
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
            <div
              v-for="e in others"
              :key="e.id"
              class="flex items-start gap-1 rounded-2xl bg-surface-2 px-4 py-3"
            >
              <div class="min-w-0 flex-1">
                <p><ExampleText :sentence="e.sentence" :marks="e.marks" /></p>
                <p v-if="e.translation" class="mt-1 text-sm text-muted">{{ e.translation }}</p>
              </div>
              <SpeakButton :text="e.sentence" :lang="card.lang" class="-my-1.5 shrink-0" />
            </div>
          </div>
        </template>
      </div>

      <MarkdownView v-if="card.note.trim()" :source="card.note" class="text-sm text-muted" />
      <DictLinks :word="card.word" :lang="card.lang" />
    </template>
  </div>
</template>
