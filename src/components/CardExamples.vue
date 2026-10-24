<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from '@lucide/vue'
import type { Card, DerivedWord, RelKind, VocabCard } from '@/db/types'
import MarkdownView from './MarkdownView.vue'
import SpeakButton from './SpeakButton.vue'
import ExampleText from './ExampleText.vue'
import BottomSheet from './BottomSheet.vue'
import SelectBox from './SelectBox.vue'
import { db } from '@/db'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { uid } from '@/lib/id'
import { applySenses, newVocabCard } from '@/lib/cards'
import { matchPos } from '@/lib/importCards'
import { findVocab, REL_KINDS } from '@/lib/relations'
import { deckPickerOptions } from '@/lib/tree'
import { canAutoReading, generateReading } from '@/lib/tts/autoReading'

// examples and note of a card, for the page that shows them beneath the card itself
const props = defineProps<{ card: Card }>()
const data = useData()
const settings = useSettings()
const ui = useUi()

const examples = computed(() =>
  props.card.type === 'vocab' ? props.card.examples.filter((e) => e.sentence.trim()) : [],
)
const note = computed(() => (props.card.type === 'vocab' ? props.card.note.trim() : ''))

// each derived word has a button to make it a card of its own
const derived = computed(() =>
  props.card.type === 'vocab' ? (props.card.derived ?? []).filter((d) => d.word.trim()) : [],
)

async function fillReading(id: string, word: string, lang: VocabCard['lang']) {
  if (!canAutoReading(lang)) return
  const reading = await generateReading(word, lang, settings.synced.reading.enStyle).catch(
    () => null,
  )
  // read from the database: the store may not have the new card yet
  const now = reading ? await db.cards.get(id) : undefined
  if (reading && now?.type === 'vocab' && !now.reading.trim()) {
    await data.saveCard({ ...now, reading })
  }
}

async function make(row: DerivedWord, deckId: string, kind: RelKind) {
  const main = props.card
  if (main.type !== 'vocab') return
  let target = findVocab(data.cards, main.lang, row.word, main.id)
  const existed = !!target
  if (!target) {
    const options = settings.synced.pos[main.lang]
    const pos = row.pos
      .split(/[,，、;；/]/)
      .map((p) => matchPos(p, options)?.id)
      .filter((id): id is string => !!id)
    const c = newVocabCard(deckId, main.lang, row.word)
    applySenses(c, [{ id: uid(), pos: [...new Set(pos)], meaning: row.meaning }])
    await data.addCards([c])
    target = c
  }
  const prev = main.rel ?? {}
  const next = { ...prev, [kind]: [...new Set([...(prev[kind] ?? []), target.id])] }
  // it is a card now (linked under 關聯詞, in the kind picked), so it leaves the list of derived words
  const left = (main.derived ?? []).filter((d) => d.id !== row.id)
  await data.saveCard({ ...main, rel: next, derived: left.length ? left : undefined })
  await data.syncRelations(main.id, prev, next)
  // after the links are written, or this save of the card could overwrite them
  if (!existed) void fillReading(target.id, target.word, main.lang)
  ui.toast(existed ? `已連結既有的「${row.word}」` : `已建立「${row.word}」`, 'success')
}

// making a card asks which kind of related word it is (derived, by default) and, when the word has
// no card yet, which deck to put it in
const pending = ref<DerivedWord | null>(null)
const targetDeck = ref('')
const targetKind = ref<RelKind>('der')
const deckOptions = computed(() => deckPickerOptions(data.nodes))
// a word that already has a card is linked to it instead of getting a second one
const existing = computed(() => {
  const main = props.card
  if (main.type !== 'vocab' || !pending.value) return undefined
  return findVocab(data.cards, main.lang, pending.value.word, main.id)
})
const hasCard = computed(() => !!existing.value)
const existingDeck = computed(
  () => deckOptions.value.find((d) => d.id === existing.value?.deckId)?.path ?? '',
)
const picking = computed({
  get: () => pending.value !== null,
  set: (v) => {
    if (!v) pending.value = null
  },
})
function start(row: DerivedWord) {
  const main = props.card
  if (main.type !== 'vocab') return
  targetDeck.value = main.deckId
  targetKind.value = 'der'
  pending.value = row
}
function confirmMake() {
  const row = pending.value
  pending.value = null
  if (row && targetDeck.value) void make(row, targetDeck.value, targetKind.value)
}
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
  <section v-if="card.type === 'vocab' && derived.length" class="card mb-3">
    <h2 class="label">衍生字</h2>
    <ul class="divide-y divide-line">
      <li
        v-for="row in derived"
        :key="row.id"
        class="flex items-center gap-3 py-2.5 first:pt-1 last:pb-0"
      >
        <div class="min-w-0 flex-1">
          <p>
            <span class="font-semibold">{{ row.word }}</span>
            <span v-if="row.pos" class="ml-2 text-xs text-muted">{{ row.pos }}</span>
          </p>
          <p class="text-sm text-muted">{{ row.meaning }}</p>
        </div>
        <button type="button" class="chip shrink-0 gap-1" @click="start(row)">
          <Plus :size="14" /> 建卡
        </button>
      </li>
    </ul>
  </section>
  <section v-if="card.type === 'vocab' && note" class="card mb-3">
    <h2 class="label">備註</h2>
    <MarkdownView :source="card.note" class="text-sm" />
  </section>
  <BottomSheet
    v-model="picking"
    :title="`${hasCard ? '連結單字卡' : '建立單字卡'}：${pending?.word ?? ''}`"
  >
    <div class="space-y-5">
      <div>
        <p class="section-label">要加入哪一類關聯詞</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="k in REL_KINDS"
            :key="k.id"
            type="button"
            class="chip"
            :class="{ 'chip-on': targetKind === k.id }"
            @click="targetKind = k.id"
          >
            {{ k.label }}
          </button>
        </div>
      </div>
      <p v-if="hasCard" class="text-sm text-muted">
        已經有「{{ existing?.word }}」的單字卡（{{ existingDeck }}），不會再建一張，只加上連結。
      </p>
      <div v-else>
        <p class="section-label">放在哪個牌組</p>
        <SelectBox v-model="targetDeck">
          <option
            v-for="d in deckOptions"
            :key="d.id"
            :value="d.id"
            :path="d.path"
            :tree="d.tree"
            :disabled="d.disabled"
          >
            {{ d.name }}
          </option>
        </SelectBox>
      </div>
      <button type="button" class="btn btn-primary w-full" @click="confirmMake">
        {{ hasCard ? '連結' : '建立' }}
      </button>
    </div>
  </BottomSheet>
</template>
