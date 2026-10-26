<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  BookOpen,
  Eye,
  GripVertical,
  Highlighter,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import DictLinks from '@/components/DictLinks.vue'
import CardFace from '@/components/CardFace.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import SelectBox from '@/components/SelectBox.vue'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { LANGS } from '@/db/defaults'
import type { BasicCard, Card, Example, Lang, Sense, VocabCard } from '@/db/types'
import {
  applySenses,
  findWordMark,
  isComplete,
  newBasicCard,
  newVocabCard,
  sensesOf,
} from '@/lib/cards'
import { uid } from '@/lib/id'
import { moved, useDragSort } from '@/composables/useDragSort'
import { deckPickerOptions } from '@/lib/tree'
import { db } from '@/db'
import { canAutoReading, generateReading } from '@/lib/tts/autoReading'
import type { DictResult } from '@/lib/dictLookup'
import DictResultSheet from '@/components/DictResultSheet.vue'
import RelationEditor from '@/components/RelationEditor.vue'
import type { RelatedWords } from '@/lib/relations'

const route = useRoute()
const router = useRouter()
const data = useData()
const settings = useSettings()
const ui = useUi()

const genBusy = ref(false)
async function autoReading() {
  const v = vocab.value
  if (!v || genBusy.value) return
  if (!v.word.trim()) return ui.toast('請先輸入單字', 'error')
  genBusy.value = true
  try {
    const r = await generateReading(v.word, v.lang, settings.synced.reading.enStyle)
    if (r) v.reading = r
    else ui.toast('無法產生這個單字的讀音', 'error')
  } catch {
    ui.toast('產生讀音失敗', 'error')
  } finally {
    genBusy.value = false
  }
}

// the dictionary lookup was removed; the sheet stays until a new source is wired in
const dictResult = ref<DictResult | null>(null)
const showDict = ref(false)

const stubs = ref<VocabCard[]>([])
const relEditor = ref<InstanceType<typeof RelationEditor> | null>(null)

async function applyDict(picked: {
  senses: { meaning: string; pos: string[] }[]
  pos: string[]
  examples: Example[]
  related: RelatedWords
}) {
  const v = vocab.value
  if (!v) return
  const known = new Set(settings.synced.pos[v.lang].map((o) => o.id))
  const pos = picked.pos.filter((p) => known.has(p))
  const senses = (v.senses ??= [])
  if (picked.senses.length) {
    // one meaning each; a lone meaning without its own part of speech takes the picked ones
    const lone = picked.senses.length === 1
    const added = picked.senses.map((s) => {
      const own = s.pos.filter((p) => known.has(p))
      return { id: uid(), pos: own.length || !lone ? own : pos, meaning: s.meaning }
    })
    // replace the empty first meaning, otherwise add the dictionary's after the existing ones
    const first = senses[0]
    if (senses.length === 1 && first && !first.meaning.trim() && !first.pos.length) senses.shift()
    senses.push(...added)
  } else if (senses[0]) {
    for (const p of pos) if (!senses[0].pos.includes(p)) senses[0].pos.push(p)
  }
  v.examples.push(...picked.examples)
  picked.examples.forEach(autoMark)
  for (const kind of ['syn', 'ant', 'der'] as const)
    for (const w of picked.related[kind]) relEditor.value?.linkWord(kind, w)
  if (!v.reading.trim() && canAutoReading(v.lang)) {
    try {
      v.reading = (await generateReading(v.word, v.lang, settings.synced.reading.enStyle)) ?? ''
    } catch {
      /* reading is optional */
    }
  }
}

const editingId = computed(() => (route.name === 'card-edit' ? String(route.params.id) : null))
const LAST_LANG = 'sr.lastLang'

const card = ref<Card | null>(null)
const original = ref('')
let saved = false

/** Vocab cards are edited as a list of meanings; an older card's single meaning becomes the first one. */
function ensureSenses(c: Card | null) {
  if (c?.type !== 'vocab') return
  const list = sensesOf(c).map((s) => ({ ...s, pos: [...s.pos] }))
  c.senses = list.length ? list : [{ id: uid(), pos: [], meaning: '' }]
}

async function init() {
  saved = false
  stubs.value = []
  if (editingId.value) {
    const c = await db.cards.get(editingId.value)
    card.value = c && !c.deleted ? structuredClone(c) : null
  } else {
    const deck = String(route.query.deck ?? '')
    const type = route.query.type === 'vocab' ? 'vocab' : 'basic'
    const lang = (route.query.lang as Lang) || (localStorage.getItem(LAST_LANG) as Lang) || 'en'
    card.value = type === 'vocab' ? newVocabCard(deck, lang) : newBasicCard(deck)
  }
  ensureSenses(card.value)
  original.value = JSON.stringify(card.value)
}
watch(() => route.fullPath, init, { immediate: true })

const dirty = computed(() => card.value && JSON.stringify(card.value) !== original.value)

// every deck as a tree; only one without sub-decks can hold cards, the others are greyed out
const deckOptions = computed(() => deckPickerOptions(data.nodes))

/** Switch between card types while creating, carrying over the main text. */
function switchType(t: 'basic' | 'vocab') {
  const c = card.value
  if (!c || c.type === t) return
  if (t === 'vocab') {
    const v = newVocabCard(c.deckId, (localStorage.getItem(LAST_LANG) as Lang) || 'en')
    const b = c as BasicCard
    v.word = b.front
    v.id = c.id
    card.value = v
    ensureSenses(v)
    v.senses![0]!.meaning = b.back
  } else {
    const b = newBasicCard(c.deckId)
    const v = c as VocabCard
    b.front = v.word
    b.back = (v.senses ?? [])
      .map((x) => x.meaning.trim())
      .filter(Boolean)
      .join('\n')
    b.id = c.id
    card.value = b
  }
}

const typeModel = computed({
  get: () => card.value?.type ?? 'basic',
  set: (t) => switchType(t),
})

const vocab = computed(() => (card.value?.type === 'vocab' ? card.value : null))
const basic = computed(() => (card.value?.type === 'basic' ? card.value : null))

const missing = computed(() => {
  const c = card.value
  if (!c) return []
  const m: string[] = []
  if (c.type === 'basic') {
    if (!c.front.trim()) m.push('正面')
    if (!c.back.trim()) m.push('反面')
  } else {
    if (!c.word.trim()) m.push('單字')
    if (!c.senses?.some((x) => x.meaning.trim())) m.push('詞義')
  }
  return m
})

const frontEmpty = computed(() => {
  const c = card.value
  return !c || (c.type === 'basic' ? !c.front.trim() : !c.word.trim())
})

const dupKey = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()

/** Other cards (not archived or deleted) whose word / question is the same as what is being typed. */
const duplicates = computed(() => {
  const c = card.value
  if (!c) return []
  const key = dupKey(c.type === 'basic' ? c.front : c.word)
  if (!key) return []
  return data.cards
    .filter((o) => o.id !== c.id && dupKey(o.type === 'basic' ? o.front : o.word) === key)
    .slice(0, 5)
    .map((o) => ({ id: o.id, text: data.nodeById.get(o.deckId)?.name ?? '' }))
})

function togglePos(sense: Sense, id: string) {
  sense.pos = sense.pos.includes(id) ? sense.pos.filter((p) => p !== id) : [...sense.pos, id]
}

function addSense() {
  vocab.value?.senses?.push({ id: uid(), pos: [], meaning: '' })
}

const exDrag = useDragSort((from, to) => {
  const v = vocab.value
  if (v) v.examples = moved(v.examples, from, to)
})

/** Grow a textarea with its text, so a one-line sentence takes one line. */
function fit(el: HTMLElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
const vAutosize = { mounted: fit, updated: fit }

// examples whose automatic mark the user removed by hand: do not add it again
const autoOff = new Set<string>()

/** Mark the card's word in a sentence when it appears exactly (as a whole word for en). */
function autoMark(ex: Example) {
  const v = vocab.value
  if (!v || !v.word.trim() || ex.marks?.length || autoOff.has(ex.id)) return
  const found = findWordMark(v.word, v.lang, ex.sentence)
  if (found) ex.marks = [found]
}

/** Color the text currently selected in this example's sentence box. */
function markSelection(e: Event, ex: Example) {
  const box = (e.currentTarget as HTMLElement)
    .closest('[data-sort-item]')
    ?.querySelector('textarea')
  if (!box) return
  const text = box.value.slice(box.selectionStart, box.selectionEnd).trim()
  if (!text) return ui.toast('請先在例句中選取要標示的文字', 'info')
  if (!ex.marks?.includes(text)) (ex.marks ??= []).push(text)
}

function unmark(ex: Example, text: string) {
  autoOff.add(ex.id)
  ex.marks = ex.marks?.filter((m) => m !== text)
  if (!ex.marks?.length) delete ex.marks
}

const hasMark = (ex: Example) => !!ex.marks?.length

/** Detect the word in every example that has no mark yet, for the user to fix by hand where it misses. */
function autoMarkAll() {
  const v = vocab.value
  if (!v) return
  let n = 0
  for (const ex of v.examples) {
    if (ex.marks?.some((m) => ex.sentence.includes(m))) continue
    autoOff.delete(ex.id)
    delete ex.marks
    autoMark(ex)
    if (hasMark(ex)) n++
  }
  if (n) ui.toast(`已標示 ${n} 個例句`, 'success')
  else ui.toast('沒有偵測到可標示的字詞，請在例句中選取文字後手動標示', 'info')
}

function addExample() {
  vocab.value?.examples.push({ id: uid(), sentence: '', translation: '' })
}

function addDerived() {
  const v = vocab.value
  if (v) (v.derived ??= []).push({ id: uid(), word: '', pos: '', meaning: '' })
}

// a new card typed in by hand gets its reading made after it is saved, without making the user wait
async function fillReading(id: string, word: string, lang: Lang) {
  const reading = await generateReading(word, lang, settings.synced.reading.enStyle).catch(
    () => null,
  )
  // read from the database: the store may not have the card yet right after it was saved
  const now = await db.cards.get(id)
  if (reading && now?.type === 'vocab' && !now.reading.trim()) {
    await data.saveCard({ ...now, reading })
  }
}

const frontOf = (c: Card) => (c.type === 'basic' ? c.front : c.word)

/** Ask before saving a card whose word / question already exists; an edit that leaves it alone is not asked. */
async function confirmDuplicates() {
  const before = original.value ? (JSON.parse(original.value) as Card) : null
  if (editingId.value && before && dupKey(frontOf(before)) === dupKey(frontOf(card.value!)))
    return true
  return ui.confirm('已有相同的卡片', {
    message: '儲存後會多出一張重複的卡片，之後可以再手動刪除。',
    items: duplicates.value.map((d) => d.text),
    confirmText: '仍要儲存',
  })
}

async function save(next = false) {
  const c = card.value
  if (!c) return
  if (!c.deckId || !data.nodeById.get(c.deckId)) return ui.toast('請選擇牌組', 'error')
  if (frontEmpty.value)
    return ui.toast(c.type === 'basic' ? '至少要填寫正面' : '至少要填寫單字', 'error')
  if (duplicates.value.length && !(await confirmDuplicates())) return
  if (c.type === 'vocab') {
    applySenses(c, c.senses ?? [])
    c.examples = c.examples.filter((e) => e.sentence.trim() || e.translation.trim())
    c.derived = c.derived?.filter((d) => d.word.trim())
    if (!c.derived?.length) delete c.derived
    // marks whose text was edited away no longer apply
    for (const e of c.examples) {
      e.marks = e.marks?.filter((m) => e.sentence.includes(m))
      if (!e.marks?.length) delete e.marks
    }
    localStorage.setItem(LAST_LANG, c.lang)
  }
  const before = original.value ? (JSON.parse(original.value) as Card) : null
  const prevRel = before?.type === 'vocab' ? before.rel : undefined
  if (c.type === 'vocab') {
    // new cards typed in as related words: only those still linked are created
    const linked = new Set(Object.values(c.rel ?? {}).flat())
    for (const s of stubs.value) {
      if (!linked.has(s.id)) continue
      s.deckId = c.deckId
      await data.saveCard(s)
    }
    stubs.value = []
  }
  await data.saveCard(c)
  if (c.type === 'vocab' && !editingId.value && !c.reading.trim() && canAutoReading(c.lang))
    void fillReading(c.id, c.word, c.lang)
  if (c.type === 'vocab')
    await data.syncRelations(c.id, editingId.value ? prevRel : undefined, c.rel)
  saved = true
  ui.toast(isComplete(c) ? '已儲存' : '已儲存為未完成卡片', 'success')
  if (next) {
    const deck = c.deckId
    const type = c.type
    card.value = type === 'vocab' ? newVocabCard(deck, (c as VocabCard).lang) : newBasicCard(deck)
    ensureSenses(card.value)
    original.value = JSON.stringify(card.value)
    saved = false
    window.scrollTo({ top: 0 })
  } else if (editingId.value) router.back()
  else router.replace(`/node/${c.deckId}`)
}

onBeforeRouteLeave(async () => {
  if (saved || !dirty.value) return true
  return ui.confirm('放棄尚未儲存的變更？', {
    message: '這次編輯的內容不會被儲存，也無法復原。',
    confirmText: '放棄',
    danger: true,
  })
})

const showPreview = ref(false)
const previewRevealed = ref(false)
</script>

<template>
  <div v-if="card">
    <PageHeader hide-back>
      <template #left>
        <button class="btn px-2 text-muted hover:text-ink" @click="router.back()">取消</button>
      </template>
      <template #title>{{ editingId ? '編輯卡片' : '新卡片' }}</template>
    </PageHeader>

    <div class="space-y-6">
      <div>
        <label class="section-label">牌組</label>
        <SelectBox v-model="card.deckId">
          <option value="" disabled>選擇牌組</option>
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

      <div v-if="!editingId">
        <label class="section-label">卡片類型</label>
        <PillTabs
          v-model="typeModel"
          :options="[
            { value: 'basic', label: '正反卡' },
            { value: 'vocab', label: '單字卡' },
          ]"
        />
      </div>

      <!-- basic -->
      <template v-if="basic">
        <div>
          <MarkdownEditor
            v-model="basic.front"
            label="正面（問題）"
            placeholder="輸入問題，支援 Markdown 與 ||防劇透||"
            :rows="4"
          />
        </div>
        <div>
          <MarkdownEditor
            v-model="basic.back"
            label="反面（答案）"
            placeholder="輸入答案（可以之後再補）"
            :rows="5"
          />
        </div>
      </template>

      <!-- vocab -->
      <template v-if="vocab">
        <div>
          <label class="section-label">語言</label>
          <PillTabs
            v-model="vocab.lang"
            :options="LANGS.map((l) => ({ value: l.id, label: l.label }))"
          />
        </div>
        <div class="card space-y-3">
          <div>
            <label class="section-label">單字</label>
            <div class="flex items-center gap-2">
              <input
                v-model="vocab.word"
                class="input text-lg font-semibold"
                placeholder="想記住的單字"
              />
              <SpeakButton :text="vocab.word" :lang="vocab.lang" :reading="vocab.reading" />
            </div>
          </div>
          <div>
            <div class="flex items-center justify-between">
              <label class="label">讀音（選填）</label>
              <button
                v-if="canAutoReading(vocab.lang)"
                class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-50"
                :disabled="genBusy"
                @click="autoReading"
              >
                <Sparkles :size="14" /> {{ genBusy ? '產生中…' : '自動產生' }}
              </button>
            </div>
            <input
              v-model="vocab.reading"
              class="input"
              :placeholder="
                vocab.lang === 'ja'
                  ? 'ふりがな'
                  : vocab.lang === 'en'
                    ? settings.synced.reading.enStyle === 'kk'
                      ? '[fəˋnɛtɪk]'
                      : '/fəˈnetɪk/'
                    : 'hangugeo'
              "
            />
            <div class="mt-1.5 space-y-0.5 text-xs text-muted">
              <p
                v-for="line in {
                  en: [
                    '填寫 IPA（/əˈreɪndʒ/）或 KK 音標（[əˋrendʒ]）時，Kokoro 會照讀音發音。',
                    '有多個讀音時用第一個。',
                  ],
                  ja: [
                    '填寫假名時會照假名發音，可以指定多音字的念法。',
                    '寫了多個讀音時改念單字。',
                  ],
                  ko: [
                    '自動產生的是羅馬拼音（依實際唸法，例如 읽다 → ikda）。',
                    '也可以填實際發音的韓文（例如 [익따]），發音會照它念；其他寫法改念單字。',
                  ],
                }[vocab.lang]"
                :key="line"
              >
                {{ line }}
              </p>
            </div>
          </div>
          <DictLinks :word="vocab.word" :lang="vocab.lang" />
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="section-label">詞義</label>
            <!-- hidden: no lookup source for now -->
            <button
              v-if="false"
              class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-50"
            >
              <BookOpen :size="14" /> 從字典填入
            </button>
          </div>
          <div class="space-y-3">
            <div
              v-for="(s, i) in vocab.senses"
              :key="s.id"
              class="card space-y-3 p-4"
              :class="{ 'pt-2': vocab.senses!.length > 1 }"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold tracking-[1px] text-muted">#{{ i + 1 }}</span>
                <div class="flex-1" />
                <button
                  v-if="vocab.senses!.length > 1"
                  class="icon-btn bg-surface-2 text-danger"
                  aria-label="刪除詞義"
                  @click="vocab.senses!.splice(i, 1)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in settings.synced.pos[vocab.lang].filter(
                    (o) => !o.hidden || s.pos.includes(o.id),
                  )"
                  :key="p.id"
                  type="button"
                  class="chip"
                  :class="{ 'chip-on': s.pos.includes(p.id) }"
                  @click="togglePos(s, p.id)"
                >
                  {{ p.label }}
                </button>
              </div>
              <textarea
                v-model="s.meaning"
                v-autosize
                rows="1"
                class="input resize-none overflow-hidden"
                placeholder="這個詞性的詞義"
              />
            </div>
            <button type="button" class="btn btn-ghost w-full" @click="addSense">
              <Plus :size="18" /> 新增詞義
            </button>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="section-label">例句</label>
            <button
              v-if="vocab.examples.length"
              type="button"
              class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary"
              @click="autoMarkAll"
            >
              <Highlighter :size="14" /> 自動標示單字
            </button>
          </div>
          <div class="space-y-3">
            <div
              v-for="(e, i) in vocab.examples"
              :key="e.id"
              data-sort-item
              class="card space-y-2 p-4 pt-2"
              :class="{ 'shadow-lg': exDrag.dragging(i) }"
              :style="exDrag.style(i)"
            >
              <div class="flex items-center gap-2">
                <button
                  v-if="vocab.examples.length > 1"
                  type="button"
                  class="-ml-1 flex size-7 touch-none items-center justify-center rounded-lg text-muted hover:bg-surface-2"
                  aria-label="拖曳排序"
                  @pointerdown="exDrag.start($event, i)"
                >
                  <GripVertical :size="16" />
                </button>
                <span class="text-xs font-bold tracking-[1px] text-muted">#{{ i + 1 }}</span>
                <div class="flex-1" />
                <SpeakButton :text="e.sentence" :lang="vocab.lang" />
                <button
                  class="icon-btn bg-surface-2 text-danger"
                  aria-label="刪除例句"
                  @click="vocab.examples.splice(i, 1)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <!-- sentence and translation share one box, so they read as a pair -->
              <div
                class="overflow-hidden rounded-xl border border-line bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
              >
                <textarea
                  v-model="e.sentence"
                  v-autosize
                  rows="1"
                  class="block w-full resize-none overflow-hidden bg-transparent px-3.5 py-2.5 outline-none placeholder:text-muted"
                  placeholder="例句"
                  @blur="autoMark(e)"
                />
                <textarea
                  v-model="e.translation"
                  v-autosize
                  rows="1"
                  class="block w-full resize-none overflow-hidden border-t border-dashed border-line bg-transparent px-3.5 py-2.5 text-muted outline-none placeholder:text-muted"
                  placeholder="翻譯"
                />
              </div>
              <div class="flex flex-wrap items-center gap-2 pt-1.5">
                <button
                  type="button"
                  class="icon-btn shrink-0 bg-surface-2"
                  aria-label="標示選取的文字"
                  title="標示選取的文字"
                  @mousedown.prevent
                  @click="markSelection($event, e)"
                >
                  <Highlighter :size="15" />
                </button>
                <span
                  v-if="!e.marks?.some((x) => e.sentence.includes(x))"
                  class="text-xs text-muted"
                >
                  選取文字後點此標示單字
                </span>
                <span
                  v-for="m in (e.marks ?? []).filter((x) => e.sentence.includes(x))"
                  :key="m"
                  class="chip chip-on gap-1 pr-1.5"
                >
                  {{ m }}
                  <button type="button" :aria-label="`取消標示 ${m}`" @click="unmark(e, m)">
                    <X :size="14" />
                  </button>
                </span>
              </div>
            </div>
            <button type="button" class="btn btn-ghost w-full" @click="addExample">
              <Plus :size="18" /> 新增例句
            </button>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="section-label">關聯詞</label>
            <button
              type="button"
              class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary"
              @click="relEditor?.start()"
            >
              <Plus :size="14" /> 加入關聯詞
            </button>
          </div>
          <RelationEditor ref="relEditor" v-model:stubs="stubs" :card="vocab" />
          <p class="mt-1 text-xs text-muted">
            加入新單字時會一併建成單字卡；關聯會同步記錄在對方的卡片上。
          </p>
        </div>
        <div>
          <label class="section-label">衍生字</label>
          <div class="space-y-3">
            <div v-for="(d, i) in vocab.derived" :key="d.id" class="card space-y-2 p-4">
              <div class="flex items-center gap-2">
                <input v-model="d.word" class="input min-w-0 flex-1" placeholder="衍生字" />
                <button
                  type="button"
                  class="icon-btn shrink-0 bg-surface-2 text-danger"
                  aria-label="刪除衍生字"
                  @click="vocab.derived!.splice(i, 1)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <div class="flex gap-2">
                <input v-model="d.pos" class="input w-24 shrink-0" placeholder="詞性" />
                <input v-model="d.meaning" class="input min-w-0 flex-1" placeholder="詞義" />
              </div>
            </div>
            <button type="button" class="btn btn-ghost w-full" @click="addDerived">
              <Plus :size="18" /> 新增衍生字
            </button>
          </div>
          <p class="mt-2 text-xs text-muted">
            純顯示用，不會另外建卡；未來可以從詳細頁將衍生字建成單字卡。
          </p>
        </div>
        <div>
          <MarkdownEditor
            v-model="vocab.note"
            label="備註（選填）"
            placeholder="補充說明、相似字…"
            :rows="2"
          />
        </div>
      </template>

      <div v-if="missing.length" class="flex gap-2.5 rounded-2xl bg-warn/15 px-4 py-3 text-sm">
        <TriangleAlert :size="16" class="mt-0.5 shrink-0 text-warn" />
        <div class="space-y-0.5">
          <p class="font-semibold">尚未填寫：{{ missing.join('、') }}</p>
          <p>可以先儲存，卡片會標示為「未完成」，補齊後才會進入學習。</p>
        </div>
      </div>

      <!-- the main action is the wide button; the extras sit side by side under it -->
      <button
        v-if="!editingId"
        class="btn btn-primary mb-2 w-full py-4"
        :disabled="frontEmpty"
        @click="save()"
      >
        儲存
      </button>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn btn-ghost" @click="((showPreview = true), (previewRevealed = false))">
          <Eye :size="18" /> 預覽
        </button>
        <button v-if="!editingId" class="btn btn-soft" :disabled="frontEmpty" @click="save(true)">
          儲存並新增下一張
        </button>
        <button v-else class="btn btn-primary" :disabled="frontEmpty" @click="save()">儲存</button>
      </div>
    </div>

    <DictResultSheet
      v-if="vocab"
      v-model="showDict"
      :result="dictResult"
      :word="vocab.word"
      :lang="vocab.lang"
      @apply="applyDict"
    />

    <BottomSheet v-model="showPreview" title="預覽">
      <div class="card min-h-48" @click="previewRevealed = true">
        <CardFace :card="card" :revealed="previewRevealed" />
      </div>
      <button class="btn btn-primary mt-4 w-full" @click="previewRevealed = !previewRevealed">
        {{ previewRevealed ? '看正面' : '顯示答案' }}
      </button>
    </BottomSheet>
  </div>
  <div v-else class="py-20 text-center text-muted">找不到卡片</div>
</template>
