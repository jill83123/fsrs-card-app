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
defineExpose({ linkWord, start })

// the kinds that have words, each with its words
const groups = computed(() =>
  REL_KINDS.map((k) => ({
    kind: k.id,
    label: k.label,
    items: ids(k.id).map((id) => ({ id, word: wordOf(id)! })),
  })).filter((g) => g.items.length),
)

// the sheet for adding words: pick the kind on top, then the words
const adding = ref(false)
const picking = ref<RelKind>('syn')
const open = adding
const query = ref('')

// the sheet for one word already added: change its kind or remove it
const editing = ref<{ kind: RelKind; id: string } | null>(null)
const editOpen = computed({
  get: () => editing.value !== null,
  set: (v) => {
    if (!v) editing.value = null
  },
})
function moveTo(kind: RelKind) {
  const e = editing.value
  if (!e) return
  if (kind !== e.kind) {
    // linked first, so a new card is not dropped as unused in between
    link(kind, e.id)
    unlink(e.kind, e.id)
  }
  editing.value = null
}
function removeEditing() {
  const e = editing.value
  if (e) unlink(e.kind, e.id)
  editing.value = null
}

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

function start() {
  query.value = ''
  adding.value = true
}
function toggle(id: string) {
  const kind = picking.value
  if (props.card.rel?.[kind]?.includes(id)) unlink(kind, id)
  else link(kind, id)
}
function addNew() {
  linkWord(picking.value, query.value)
  query.value = ''
}
</script>

<template>
  <div>
    <!-- only the kinds that have words get a line: the kind on the left, its words beside it;
         the button that adds words sits in the header of this section, in the edit page -->
    <div v-if="groups.length" class="card divide-y divide-line px-4 py-2">
      <div v-for="g in groups" :key="g.kind" class="flex items-start gap-3 py-2.5">
        <p class="w-14 shrink-0 pt-1 text-sm font-semibold text-muted">{{ g.label }}</p>
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <!-- tap a word to change its kind or remove it -->
          <span v-for="r in g.items" :key="r.id" class="chip chip-on gap-1 pr-1.5">
            <button
              type="button"
              :aria-label="`${r.word}：${g.label}，點擊更改`"
              @click="editing = { kind: g.kind, id: r.id }"
            >
              {{ r.word }}
            </button>
            <button type="button" :aria-label="`移除 ${r.word}`" @click="unlink(g.kind, r.id)">
              <X :size="14" />
            </button>
          </span>
        </div>
      </div>
    </div>

    <BottomSheet v-model="open" title="加入關聯詞">
      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="k in REL_KINDS"
            :key="k.id"
            type="button"
            class="chip"
            :class="{ 'chip-on': picking === k.id }"
            @click="picking = k.id"
          >
            {{ k.label }}
          </button>
        </div>
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
            :class="card.rel?.[picking]?.includes(c.id) ? 'border-primary' : 'border-line'"
            @click="toggle(c.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ c.word }}</span>
              <span class="block truncate text-sm text-muted">{{ c.meaning.split('\n')[0] }}</span>
            </span>
            <Check v-if="card.rel?.[picking]?.includes(c.id)" :size="16" class="text-primary" />
          </button>
          <p v-if="!candidates.length" class="py-4 text-center text-sm text-muted">
            沒有符合的單字卡。
          </p>
        </div>
      </div>
    </BottomSheet>

    <BottomSheet v-model="editOpen" :title="editing ? wordOf(editing.id) : ''">
      <div class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="k in REL_KINDS"
            :key="k.id"
            type="button"
            class="chip"
            :class="{ 'chip-on': editing?.kind === k.id }"
            @click="moveTo(k.id)"
          >
            {{ k.label }}
          </button>
        </div>
        <button type="button" class="btn btn-ghost w-full text-danger" @click="removeEditing">
          移除
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
