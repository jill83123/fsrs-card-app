<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Plus, X } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import type { RelKind, VocabCard } from '@/db/types'
import { useData } from '@/stores/data'
import { newVocabCard } from '@/lib/cards'
import { findVocab, normWord, REL_KINDS } from '@/lib/relations'

const props = defineProps<{ card: VocabCard }>()
/** cards that do not exist yet: created together with this card when it is saved */
const stubs = defineModel<VocabCard[]>('stubs', { required: true })
const data = useData()

const wordOf = (id: string) =>
  data.cardById.get(id)?.type === 'vocab'
    ? (data.cardById.get(id) as VocabCard).word
    : stubs.value.find((s) => s.id === id)?.word

const ids = (kind: RelKind) =>
  (props.card.rel?.[kind] ?? []).filter((id) => wordOf(id) !== undefined)

function link(kind: RelKind, id: string) {
  const rel = (props.card.rel ??= {})
  const list = (rel[kind] ??= [])
  if (!list.includes(id)) list.push(id)
}

function unlink(kind: RelKind, id: string) {
  const rel = props.card.rel
  if (!rel?.[kind]) return
  rel[kind] = rel[kind]!.filter((x) => x !== id)
  if (!rel[kind]!.length) delete rel[kind]
  if (!Object.keys(rel).length) props.card.rel = undefined
  // a new card nobody links to any more is dropped
  const used = REL_KINDS.some((k) => rel[k.id]?.includes(id))
  if (!used) stubs.value = stubs.value.filter((s) => s.id !== id)
}

/** Link a word: an existing card if there is one, otherwise a new card made on save. */
function linkWord(kind: RelKind, word: string) {
  const w = word.trim()
  if (!w) return
  const existing =
    findVocab(data.cards, props.card.lang, w, props.card.id) ??
    stubs.value.find((s) => normWord(s.word) === normWord(w))
  if (existing) return link(kind, existing.id)
  const stub = newVocabCard(props.card.deckId, props.card.lang, w)
  stubs.value = [...stubs.value, stub]
  link(kind, stub.id)
}
defineExpose({ linkWord })

const picking = ref<RelKind | null>(null)
const open = computed({
  get: () => picking.value !== null,
  set: (v) => {
    if (!v) picking.value = null
  },
})
const query = ref('')
const kindLabel = computed(() => REL_KINDS.find((k) => k.id === picking.value)?.label ?? '')

const candidates = computed(() => {
  const q = normWord(query.value)
  return data.cards
    .filter(
      (c): c is VocabCard =>
        c.type === 'vocab' &&
        c.lang === props.card.lang &&
        c.id !== props.card.id &&
        !!c.word.trim() &&
        (!q || normWord(c.word).includes(q) || c.meaning.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.word.localeCompare(b.word))
    .slice(0, 50)
})
const exact = computed(() => {
  const q = normWord(query.value)
  return (
    !q || candidates.value.some((c) => normWord(c.word) === q) || q === normWord(props.card.word)
  )
})

function start(kind: RelKind) {
  query.value = ''
  picking.value = kind
}
function toggle(id: string) {
  const kind = picking.value
  if (!kind) return
  if (props.card.rel?.[kind]?.includes(id)) unlink(kind, id)
  else link(kind, id)
}
function addNew() {
  if (picking.value) linkWord(picking.value, query.value)
  query.value = ''
}
</script>

<template>
  <div class="card space-y-4 p-4">
    <div v-for="k in REL_KINDS" :key="k.id" class="space-y-2">
      <p class="text-sm font-semibold text-muted">{{ k.label }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <span v-for="id in ids(k.id)" :key="id" class="chip chip-on gap-1 pr-1.5">
          {{ wordOf(id) }}
          <button type="button" :aria-label="`移除 ${wordOf(id)}`" @click="unlink(k.id, id)">
            <X :size="14" />
          </button>
        </span>
        <button type="button" class="chip" @click="start(k.id)"><Plus :size="14" /> 加入</button>
      </div>
    </div>

    <BottomSheet v-model="open" :title="`加入${kindLabel}`">
      <div class="space-y-3">
        <input v-model="query" class="input" placeholder="搜尋已有的單字，或輸入新單字" />
        <button v-if="!exact" type="button" class="btn btn-soft w-full" @click="addNew">
          <Plus :size="16" /> 新增「{{ query.trim() }}」為新單字卡
        </button>
        <div class="space-y-2">
          <button
            v-for="c in candidates"
            :key="c.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-2xl border bg-surface px-4 py-3 text-left"
            :class="
              picking && card.rel?.[picking]?.includes(c.id) ? 'border-primary' : 'border-line'
            "
            @click="toggle(c.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ c.word }}</span>
              <span class="block truncate text-sm text-muted">{{ c.meaning.split('\n')[0] }}</span>
            </span>
            <Check
              v-if="picking && card.rel?.[picking]?.includes(c.id)"
              :size="16"
              class="text-primary"
            />
          </button>
          <p v-if="!candidates.length" class="py-4 text-center text-sm text-muted">
            沒有符合的單字卡。
          </p>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>
