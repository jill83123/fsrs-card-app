<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOpen,
  Camera,
  Check,
  ClipboardPaste,
  ChevronDown,
  ImagePlus,
  Languages,
  LoaderCircle,
  MousePointerClick,
  Plus,
  ScanText,
  TextSelect,
  Trash2,
  X,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import SelectBox from '@/components/SelectBox.vue'
import DictResultSheet from '@/components/DictResultSheet.vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { LANGS } from '@/db/defaults'
import type { Example, Lang } from '@/db/types'
import { extractWords, joinBoxes, recognize, type OcrBox, type OcrProgress } from '@/lib/ocr'
import { newVocabCard } from '@/lib/cards'
import { lookupWord, translateSentence, type DictResult } from '@/lib/dictLookup'
import { uid } from '@/lib/id'
import { pathTo } from '@/lib/tree'
import { db, markLocalChange, stamp } from '@/db'

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()
const settings = useSettings()

const deckId = ref(String(route.query.deck ?? ''))
const lang = ref<Lang>((localStorage.getItem('sr.lastLang') as Lang) || 'en')
const image = ref<Blob | null>(null)
const imageUrl = ref('')
const running = ref(false)
const progress = ref<OcrProgress | null>(null)
const boxes = ref<OcrBox[]>([])
const text = ref('')
const natural = ref({ w: 0, h: 0 })

/** [first, last] index into `boxes` (reading order); absent for items typed in by hand */
type Range = [number, number]
interface WordItem {
  id: string
  text: string
  meaning: string
  pos: string[]
  /** ids of the sentences used as this word's examples */
  sids: string[]
  range?: Range
}
interface SentItem {
  id: string
  text: string
  translation: string
  range?: Range
}

const words = ref<WordItem[]>([])
const sents = ref<SentItem[]>([])
const tab = ref<'w' | 's'>('w')
const active = ref<{ kind: 'w' | 's'; id: string } | null>(null)

const deckOptions = computed(() =>
  data.nodes
    .filter((n) => !data.nodes.some((c) => c.parentId === n.id))
    .map((n) => ({
      id: n.id,
      label: pathTo(data.nodes, n.id)
        .map((x) => x.name)
        .join(' / '),
    })),
)

const normKey = (w: string) => (lang.value === 'en' ? w.trim().toLowerCase() : w.trim())

const existing = computed(() => {
  const set = new Set<string>()
  for (const c of data.cardsByDeck.get(deckId.value) ?? []) {
    if (c.type === 'vocab') set.add(normKey(c.word))
  }
  return set
})

const recognized = computed(() => boxes.value.length > 0)
const posOptions = computed(() => settings.synced.pos[lang.value])

// ---------- text helpers ----------

function cleanWord(s: string) {
  const t = s
    .replace(/’/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim()
  return lang.value === 'en' ? t.toLowerCase() : t
}

const textOf = (r: Range) => joinBoxes(boxes.value.slice(r[0], r[1] + 1), lang.value)

/** does the sentence contain the word (as whole words for English)? */
function contains(sentence: string, word: string) {
  if (!word) return false
  if (lang.value !== 'en') return sentence.includes(word)
  const flat = (x: string) =>
    ` ${x
      .toLowerCase()
      .replace(/’/g, "'")
      .replace(/[^a-z0-9']+/g, ' ')} `
  return flat(sentence).includes(flat(word))
}

function autoLink(w: WordItem) {
  for (const s of sents.value)
    if (contains(s.text, w.text) && !w.sids.includes(s.id)) w.sids.push(s.id)
}

// ---------- image ----------

function resetResult() {
  text.value = ''
  boxes.value = []
  words.value = []
  sents.value = []
  active.value = null
}

function setImage(f: Blob) {
  image.value = f
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = URL.createObjectURL(f)
  natural.value = { w: 0, h: 0 }
  resetResult()
}

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (f) setImage(f)
}

// accept pasted images too
function onPaste(e: ClipboardEvent) {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
  const f = item?.getAsFile()
  if (f) setImage(f)
}
window.addEventListener('paste', onPaste)

// phones have no Ctrl+V, so offer a button that reads the clipboard directly
const canPasteBtn = typeof navigator !== 'undefined' && !!navigator.clipboard?.read
async function pasteFromClipboard() {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (type) return setImage(await item.getType(type))
    }
    ui.toast('剪貼簿裡沒有圖片', 'error')
  } catch {
    ui.toast('無法讀取剪貼簿，請允許瀏覽器存取，或改用「選擇圖片」', 'error')
  }
}
onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})

async function run() {
  if (!image.value) return
  running.value = true
  progress.value = null
  try {
    const r = await recognize(image.value, lang.value, (p) => (progress.value = p))
    resetResult()
    boxes.value = r.boxes
    text.value = r.text
    if (!r.boxes.length) ui.toast('沒有辨識到文字', 'error')
  } catch (e) {
    ui.toast(`辨識失敗：${e instanceof Error ? e.message : e}`, 'error')
  } finally {
    running.value = false
  }
}

watch(lang, resetResult)

// ---------- picking on the image: tap = word, drag = sentence ----------

type Rect = { x0: number; y0: number; x1: number; y1: number }
const DRAG_PX = 8
const press = ref<{ x: number; y: number; px: number; py: number } | null>(null)
const dragging = ref(false)
const dragRect = ref<Rect | null>(null)
const dragSel = ref(new Set<number>())

function onImgLoad(e: Event) {
  const i = e.target as HTMLImageElement
  natural.value = { w: i.naturalWidth, h: i.naturalHeight }
}

function boxStyle(b: Rect) {
  const { w, h } = natural.value
  return {
    left: `${(b.x0 / w) * 100}%`,
    top: `${(b.y0 / h) * 100}%`,
    width: `${((b.x1 - b.x0) / w) * 100}%`,
    height: `${((b.y1 - b.y0) / h) * 100}%`,
  }
}

function rangeSet(items: { range?: Range }[]) {
  const s = new Set<number>()
  for (const it of items) if (it.range) for (let i = it.range[0]; i <= it.range[1]; i++) s.add(i)
  return s
}
const wordIdx = computed(() => rangeSet(words.value))
const sentIdx = computed(() => rangeSet(sents.value))
const activeIdx = computed(() => {
  const a = active.value
  const it = a && (a.kind === 'w' ? words.value : sents.value).find((x) => x.id === a.id)
  return it ? rangeSet([it]) : new Set<number>()
})

function boxClass(i: number) {
  if (dragSel.value.has(i)) return 'border-warn bg-warn/35'
  if (activeIdx.value.has(i))
    return active.value?.kind === 'w'
      ? 'border-2 border-primary bg-primary/55'
      : 'border-2 border-warn bg-warn/45'
  if (wordIdx.value.has(i)) return 'border-primary bg-primary/30'
  if (sentIdx.value.has(i)) return 'border-warn/60 bg-warn/15'
  return 'border-primary/30 bg-primary/5'
}

function pointOf(e: PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) / r.width) * natural.value.w,
    y: ((e.clientY - r.top) / r.height) * natural.value.h,
    px: e.clientX,
    py: e.clientY,
  }
}

function pressStart(e: PointerEvent) {
  press.value = pointOf(e)
  dragging.value = false
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function pressMove(e: PointerEvent) {
  const s = press.value
  if (!s) return
  const p = pointOf(e)
  if (!dragging.value && Math.hypot(p.px - s.px, p.py - s.py) < DRAG_PX) return
  dragging.value = true
  const r = {
    x0: Math.min(s.x, p.x),
    y0: Math.min(s.y, p.y),
    x1: Math.max(s.x, p.x),
    y1: Math.max(s.y, p.y),
  }
  dragRect.value = r
  const sel = new Set<number>()
  boxes.value.forEach((b, i) => {
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    if (cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1) sel.add(i)
  })
  dragSel.value = sel
}

function pressEnd(e: PointerEvent) {
  const s = press.value
  if (!s) return
  if (dragging.value) addSentenceFromBoxes([...dragSel.value].sort((a, b) => a - b))
  else if (e.type === 'pointerup') tapAt(s.x, s.y)
  press.value = null
  dragging.value = false
  dragRect.value = null
  dragSel.value = new Set()
}

function tapAt(x: number, y: number) {
  // the nearest box within a small margin, so thin boxes are still easy to hit
  let best = -1
  let bestD = Infinity
  boxes.value.forEach((b, i) => {
    const m = (b.y1 - b.y0) * 0.25
    if (x < b.x0 - m || x > b.x1 + m || y < b.y0 - m || y > b.y1 + m) return
    const d = Math.hypot(x - (b.x0 + b.x1) / 2, y - (b.y0 + b.y1) / 2)
    if (d < bestD) {
      best = i
      bestD = d
    }
  })
  if (best < 0) return
  const hit = words.value.find((w) => w.range && best >= w.range[0] && best <= w.range[1])
  if (hit) return removeWord(hit.id)
  addWordFromBox(best)
}

function open(kind: 'w' | 's', id: string) {
  tab.value = kind
  active.value = active.value?.id === id ? null : { kind, id }
}

function addWordFromBox(i: number) {
  const text = cleanWord(boxes.value[i]!.text)
  if (!text) return
  addWord(text, [i, i])
}

function addWord(raw: string, range?: Range, focus = true) {
  const text = cleanWord(raw)
  if (!text) return
  const dup = words.value.find((w) => normKey(w.text) === normKey(text))
  if (dup) {
    tab.value = 'w'
    active.value = { kind: 'w', id: dup.id }
    return
  }
  if (existing.value.has(normKey(text))) ui.toast(`牌組裡已經有「${text}」，不會重複建立`, 'info')
  const w: WordItem = { id: uid(), text, meaning: '', pos: [], sids: [], range }
  autoLink(w)
  words.value.push(w)
  if (!focus) return
  tab.value = 'w'
  active.value = { kind: 'w', id: w.id }
}

// every word found in the recognised text, to pick from when tapping the image is awkward
const allWords = computed(() => extractWords(text.value, lang.value))
const wordItemOf = (t: string) => words.value.find((w) => normKey(w.text) === normKey(t))

function toggleListed(t: string) {
  const w = wordItemOf(t)
  if (w) removeWord(w.id)
  else addWord(t, undefined, false)
}

function addSentenceFromBoxes(idx: number[]) {
  if (!idx.length) return
  const text = joinBoxes(
    idx.map((i) => boxes.value[i]!),
    lang.value,
  )
  addSentence(text, [idx[0]!, idx[idx.length - 1]!])
}

function addSentence(raw: string, range?: Range) {
  const text = raw.trim()
  if (!text) return null
  const dup = sents.value.find((s) => s.text === text)
  if (dup) {
    tab.value = 's'
    active.value = { kind: 's', id: dup.id }
    return dup
  }
  const s: SentItem = { id: uid(), text, translation: '', range }
  sents.value.push(s)
  for (const w of words.value)
    if (contains(text, w.text) && !w.sids.includes(s.id)) w.sids.push(s.id)
  tab.value = 's'
  active.value = { kind: 's', id: s.id }
  return s
}

function removeWord(id: string) {
  words.value = words.value.filter((w) => w.id !== id)
  if (active.value?.id === id) active.value = null
}

/** a word whose text was cleared is dropped rather than kept as an empty row */
function onWordBlur(w: WordItem) {
  if (w.text.trim()) autoLink(w)
  else pruneEmpty()
}

function pruneEmpty() {
  for (const w of words.value.filter((x) => !x.text.trim())) removeWord(w.id)
}
watch(active, pruneEmpty)

function removeSentence(id: string) {
  sents.value = sents.value.filter((s) => s.id !== id)
  for (const w of words.value) w.sids = w.sids.filter((x) => x !== id)
  if (active.value?.id === id) active.value = null
}

// ---------- fine-tuning ----------

/** the item's own boxes plus a few neighbours on each side, to tap when fixing its range */
function contextBoxes(r: Range, around: number) {
  const from = Math.max(0, r[0] - around)
  const to = Math.min(boxes.value.length - 1, r[1] + around)
  const out: { i: number; text: string; inside: boolean }[] = []
  for (let i = from; i <= to; i++)
    out.push({ i, text: boxes.value[i]!.text, inside: i >= r[0] && i <= r[1] })
  return out
}

/** tap a grey word to grow the range up to it; tap a selected word to drop it and what lies beyond it */
function tapContext(it: WordItem | SentItem, i: number) {
  const r = it.range
  if (!r) return
  let next: Range
  if (i < r[0]) next = [i, r[1]]
  else if (i > r[1]) next = [r[0], i]
  else if (r[0] === r[1]) return
  else if (i - r[0] <= r[1] - i) next = [i + 1, r[1]]
  else next = [r[0], i - 1]
  if ('meaning' in it) {
    const text = cleanWord(textOf(next))
    if (!text) return
    it.text = text
    it.range = next
    it.sids = it.sids.filter((id) => {
      const s = sents.value.find((x) => x.id === id)
      return s && contains(s.text, text)
    })
    autoLink(it)
  } else {
    it.range = next
    it.text = textOf(next)
  }
}

function toggleLink(w: WordItem, sid: string) {
  const i = w.sids.indexOf(sid)
  if (i >= 0) w.sids.splice(i, 1)
  else w.sids.push(sid)
}

function togglePos(w: WordItem, id: string) {
  const i = w.pos.indexOf(id)
  if (i >= 0) w.pos.splice(i, 1)
  else w.pos.push(id)
}

const linkedWords = (sid: string) => words.value.filter((w) => w.sids.includes(sid))

async function translateSent(s: SentItem) {
  const t = await translateSentence(s.text, lang.value)
  if (t) s.translation = t
  else ui.toast('翻譯失敗，請確認網路連線', 'error')
}

// ---------- manual add ----------

const newWord = ref('')
const newSent = ref('')

function addManualWords() {
  for (const t of newWord.value.split(/[,，、\n]/)) addWord(t)
  newWord.value = ''
}

function addManualSentence() {
  addSentence(newSent.value)
  newSent.value = ''
}

// ---------- dictionary ----------

const busyWord = ref('')
const bulkBusy = ref(false)
const dictResult = ref<DictResult | null>(null)
const dictFor = ref('')
const showDict = ref(false)

async function openDict(w: WordItem) {
  if (busyWord.value) return
  busyWord.value = w.id
  try {
    dictResult.value = await lookupWord(w.text, lang.value)
    dictFor.value = w.id
    showDict.value = true
  } catch {
    ui.toast('所有字典來源都無法使用，請確認網路連線', 'error')
  } finally {
    busyWord.value = ''
  }
}

function applyDict(p: { meanings: string[]; pos: string[]; examples: Example[] }) {
  const w = words.value.find((x) => x.id === dictFor.value)
  if (!w) return
  if (p.meanings.length) w.meaning = [w.meaning.trim(), ...p.meanings].filter(Boolean).join('\n')
  const known = new Set(posOptions.value.map((o) => o.id))
  for (const id of p.pos) if (known.has(id) && !w.pos.includes(id)) w.pos.push(id)
  for (const e of p.examples) {
    const s = addSentence(e.sentence)
    if (s) {
      if (e.translation && !s.translation) s.translation = e.translation
      if (!w.sids.includes(s.id)) w.sids.push(s.id)
    }
  }
  active.value = { kind: 'w', id: w.id }
  tab.value = 'w'
}

const creatable = computed(() => {
  const seen = new Set<string>()
  return words.value.filter((w) => {
    const k = normKey(w.text)
    if (!k || seen.has(k) || existing.value.has(k)) return false
    seen.add(k)
    return true
  })
})
const missingCount = computed(() => creatable.value.filter((w) => !w.meaning.trim()).length)

/** Fill the meaning and part of speech of every word that has none yet. */
async function fillAll() {
  if (bulkBusy.value) return
  bulkBusy.value = true
  let failed = 0
  try {
    const known = new Set(posOptions.value.map((o) => o.id))
    for (const w of creatable.value) {
      if (w.meaning.trim()) continue
      try {
        const r = await lookupWord(w.text, lang.value)
        if (!r) {
          failed++
          continue
        }
        w.meaning = r.meaning
        for (const id of r.pos) if (known.has(id) && !w.pos.includes(id)) w.pos.push(id)
      } catch {
        failed++
      }
    }
  } finally {
    bulkBusy.value = false
  }
  if (failed) ui.toast(`有 ${failed} 個字查不到，請點進去手動補上`, 'error')
}

// ---------- create ----------

async function create() {
  if (!deckId.value) return ui.toast('請先選擇牌組', 'error')
  const list = creatable.value
  if (!list.length) return
  const cards = list.map((w, i) => {
    const c = newVocabCard(deckId.value, lang.value, w.text)
    c.meaning = w.meaning.trim()
    c.pos = [...w.pos]
    c.examples = w.sids
      .map((id) => sents.value.find((s) => s.id === id))
      .filter((s): s is SentItem => !!s && !!s.text.trim())
      .map((s): Example => ({
        id: uid(),
        sentence: s.text.trim(),
        translation: s.translation.trim(),
      }))
    c.createdAt = c.createdAt + i
    c.updatedAt = stamp()
    return c
  })
  await db.cards.bulkPut(cards)
  markLocalChange()
  localStorage.setItem('sr.lastLang', lang.value)
  const missing = cards.filter((c) => !c.meaning).length
  ui.toast(
    missing
      ? `已建立 ${cards.length} 張單字卡，其中 ${missing} 張還沒有意思`
      : `已建立 ${cards.length} 張單字卡`,
    'success',
  )
  router.replace(`/node/${deckId.value}`)
}

const statusText = computed(() => {
  const p = progress.value
  if (!p) return '準備中…'
  const map: Record<string, string> = {
    'loading tesseract core': '載入辨識引擎',
    'initializing tesseract': '初始化',
    'loading language traineddata': '下載語言檔',
    'initializing api': '初始化',
    'recognizing text': '辨識中',
  }
  return `${map[p.status] ?? p.status} ${Math.round(p.progress * 100)}%`
})

const isActive = (kind: 'w' | 's', id: string) =>
  active.value?.kind === kind && active.value.id === id
</script>

<template>
  <div :class="words.length ? 'pb-24' : ''">
    <PageHeader title="圖片辨識新增單字" />

    <div class="space-y-4">
      <section class="card space-y-3">
        <div>
          <label class="label">加入牌組</label>
          <SelectBox v-model="deckId">
            <option value="" disabled>選擇牌組</option>
            <option v-for="d in deckOptions" :key="d.id" :value="d.id">{{ d.label }}</option>
          </SelectBox>
        </div>
        <div>
          <label class="label">圖片中的語言</label>
          <PillTabs v-model="lang" :options="LANGS.map((l) => ({ value: l.id, label: l.label }))" />
        </div>
      </section>

      <section class="card space-y-3">
        <div v-if="!imageUrl" class="space-y-3 py-2 text-center">
          <div class="grid grid-cols-2 gap-2">
            <label class="btn btn-primary cursor-pointer">
              <ImagePlus :size="18" /> 選擇圖片
              <input type="file" accept="image/*" class="hidden" @change="onFile" />
            </label>
            <label class="btn btn-ghost cursor-pointer">
              <Camera :size="18" /> 拍照
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="hidden"
                @change="onFile"
              />
            </label>
          </div>
          <button v-if="canPasteBtn" class="btn btn-ghost w-full" @click="pasteFromClipboard">
            <ClipboardPaste :size="18" /> 貼上截圖
          </button>
          <p class="text-xs text-muted">
            先複製截圖，再按「貼上截圖」；電腦上也可以直接按
            Ctrl+V。截圖已存在相簿的話，用「選擇圖片」。
          </p>
        </div>

        <template v-else>
          <div v-if="recognized" class="grid grid-cols-2 gap-2 text-xs">
            <div class="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <MousePointerClick :size="18" class="shrink-0 text-primary" />
              <span><b>點一下</b>字，新增單字</span>
            </div>
            <div class="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <TextSelect :size="18" class="shrink-0 text-warn" />
              <span><b>拖曳框住</b>一段，新增例句</span>
            </div>
          </div>

          <div class="relative mx-auto w-fit max-w-full select-none">
            <img
              :src="imageUrl"
              alt="要辨識的圖片"
              class="block max-h-[28rem] max-w-full rounded-2xl"
              draggable="false"
              @load="onImgLoad"
            />
            <div
              v-if="boxes.length && natural.w"
              class="absolute inset-0 cursor-pointer overflow-hidden rounded-2xl"
              style="touch-action: none"
              @pointerdown="pressStart"
              @pointermove="pressMove"
              @pointerup="pressEnd"
              @pointercancel="pressEnd"
            >
              <div
                v-for="(b, i) in boxes"
                :key="i"
                class="pointer-events-none absolute rounded-sm border"
                :class="boxClass(i)"
                :style="boxStyle(b)"
              />
              <div
                v-if="dragRect"
                class="pointer-events-none absolute border-2 border-dashed border-warn bg-warn/10"
                :style="boxStyle(dragRect)"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="btn btn-ghost cursor-pointer text-sm">
              <ImagePlus :size="16" /> 換一張
              <input type="file" accept="image/*" class="hidden" @change="onFile" />
            </label>
            <button class="btn btn-primary text-sm" :disabled="running" @click="run">
              <LoaderCircle v-if="running" :size="16" class="animate-spin" />
              <ScanText v-else :size="16" />
              {{ running ? statusText : recognized ? '重新辨識' : '開始辨識' }}
            </button>
          </div>
          <p v-if="!recognized" class="text-xs text-muted">
            在本機辨識，第一次使用某個語言時需要下載語言檔（英文約 4MB，日文／韓文約 10MB 以上）。
          </p>
        </template>
      </section>

      <!-- words and sentences, each edited on its own -->
      <section v-if="recognized" class="card space-y-3">
        <PillTabs
          v-model="tab"
          :options="[
            { value: 'w', label: `單字 ${words.length}` },
            { value: 's', label: `例句 ${sents.length}` },
          ]"
        />

        <!-- WORDS -->
        <template v-if="tab === 'w'">
          <p v-if="!words.length" class="py-2 text-center text-sm text-muted">
            還沒有單字。點圖片上的字，或在下面手動輸入。
          </p>
          <ul class="space-y-2">
            <li
              v-for="w in words"
              :key="w.id"
              class="rounded-2xl border"
              :class="isActive('w', w.id) ? 'border-primary' : 'border-line'"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                @click="open('w', w.id)"
              >
                <Check v-if="w.meaning.trim()" :size="16" class="shrink-0 text-primary" />
                <span class="font-semibold">{{ w.text }}</span>
                <span
                  v-if="existing.has(normKey(w.text))"
                  class="rounded bg-warn/20 px-1.5 text-[11px]"
                >
                  牌組已有
                </span>
                <span class="min-w-0 flex-1 truncate text-sm text-muted">
                  {{ w.meaning.split('\n')[0] }}
                </span>
                <span v-if="w.sids.length" class="shrink-0 text-xs text-muted">
                  {{ w.sids.length }} 句
                </span>
                <ChevronDown
                  :size="16"
                  class="shrink-0 text-muted transition-transform"
                  :class="isActive('w', w.id) ? 'rotate-180' : ''"
                />
              </button>

              <div v-if="isActive('w', w.id)" class="space-y-4 border-t border-line p-3">
                <div class="space-y-2">
                  <label class="label !mb-0">單字</label>
                  <input
                    v-model="w.text"
                    class="input text-base font-semibold"
                    @blur="onWordBlur(w)"
                  />
                  <div v-if="w.range" class="space-y-1.5">
                    <p class="text-xs text-muted">範圍不對？點灰色的字加入，點藍色的字取消</p>
                    <div class="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-2 text-sm leading-7">
                      <button
                        v-for="c in contextBoxes(w.range, 4)"
                        :key="c.i"
                        type="button"
                        class="rounded-md px-1.5"
                        :class="c.inside ? 'bg-primary/30 font-medium' : 'bg-surface text-muted'"
                        @click="tapContext(w, c.i)"
                      >
                        {{ c.text }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <label class="label !mb-0">意思（中文）</label>
                    <button
                      class="btn btn-soft px-3 py-1 text-xs"
                      :disabled="!!busyWord"
                      @click="openDict(w)"
                    >
                      <BookOpen :size="14" /> {{ busyWord === w.id ? '查詢中…' : '從字典填入' }}
                    </button>
                  </div>
                  <textarea
                    v-model="w.meaning"
                    rows="2"
                    class="input text-sm"
                    placeholder="例如：蘋果"
                  />
                </div>

                <div class="space-y-1.5">
                  <label class="label !mb-0">詞性</label>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="o in posOptions"
                      :key="o.id"
                      type="button"
                      class="chip"
                      :class="{ 'chip-on': w.pos.includes(o.id) }"
                      @click="togglePos(w, o.id)"
                    >
                      {{ o.label }}
                    </button>
                  </div>
                </div>

                <div class="space-y-2">
                  <label class="label !mb-0">例句（勾選要附在這個字上的句子）</label>
                  <p v-if="!sents.length" class="text-sm text-muted">
                    還沒有例句。到「例句」分頁，或在圖上拖曳框一句。
                  </p>
                  <div v-for="s in sents" :key="s.id" class="space-y-1.5">
                    <button
                      type="button"
                      class="flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm"
                      :class="
                        w.sids.includes(s.id) ? 'border-primary bg-primary-soft' : 'border-line'
                      "
                      @click="toggleLink(w, s.id)"
                    >
                      <Check
                        :size="14"
                        class="mt-0.5 shrink-0"
                        :class="w.sids.includes(s.id) ? 'text-primary' : 'opacity-0'"
                      />
                      {{ s.text }}
                    </button>
                    <input
                      v-if="w.sids.includes(s.id)"
                      v-model="s.translation"
                      class="input py-1.5 text-sm"
                      placeholder="這句的翻譯"
                    />
                  </div>
                </div>

                <button class="btn btn-ghost w-full text-sm text-danger" @click="removeWord(w.id)">
                  <Trash2 :size="14" /> 不要這個字
                </button>
              </div>
            </li>
          </ul>

          <details class="rounded-xl border border-line px-3 py-2">
            <summary class="cursor-pointer text-sm font-medium">
              辨識出的所有字（{{ allWords.length }}）
            </summary>
            <div class="mt-3 space-y-3">
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="t in allWords"
                  :key="t"
                  type="button"
                  class="chip text-sm"
                  :class="{ 'chip-on': !!wordItemOf(t), 'opacity-40': existing.has(normKey(t)) }"
                  @click="toggleListed(t)"
                >
                  {{ t }}
                </button>
                <span v-if="!allWords.length" class="text-sm text-muted">沒有找到單字</span>
              </div>
              <label class="label !mb-0">辨識出的文字（可以修改，上面的字會跟著更新）</label>
              <textarea v-model="text" rows="4" class="input text-sm" />
            </div>
          </details>

          <form class="flex gap-2" @submit.prevent="addManualWords">
            <input
              v-model="newWord"
              class="input py-2"
              placeholder="手動新增單字（可用逗號分隔）"
            />
            <button class="btn btn-soft shrink-0" type="submit"><Plus :size="16" /></button>
          </form>
        </template>

        <!-- SENTENCES -->
        <template v-else>
          <p v-if="!sents.length" class="py-2 text-center text-sm text-muted">
            還沒有例句。在圖片上拖曳框住一句話，或在下面手動輸入。
          </p>
          <ul class="space-y-2">
            <li
              v-for="s in sents"
              :key="s.id"
              class="rounded-2xl border"
              :class="isActive('s', s.id) ? 'border-warn' : 'border-line'"
            >
              <button
                type="button"
                class="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                @click="open('s', s.id)"
              >
                <span
                  class="min-w-0 flex-1 text-sm"
                  :class="isActive('s', s.id) ? '' : 'line-clamp-2'"
                >
                  {{ s.text }}
                </span>
                <span v-if="linkedWords(s.id).length" class="shrink-0 pt-0.5 text-xs text-muted">
                  {{ linkedWords(s.id).length }} 字
                </span>
                <ChevronDown
                  :size="16"
                  class="mt-0.5 shrink-0 text-muted transition-transform"
                  :class="isActive('s', s.id) ? 'rotate-180' : ''"
                />
              </button>

              <div v-if="isActive('s', s.id)" class="space-y-4 border-t border-line p-3">
                <div class="space-y-2">
                  <label class="label !mb-0">句子</label>
                  <textarea v-model="s.text" rows="3" class="input text-sm" />
                  <p v-if="!s.range" class="text-xs text-muted">
                    這句不是從圖上框出來的，不能用按鈕調整範圍，請直接修改文字。
                  </p>
                  <div v-else class="space-y-1.5">
                    <p class="text-xs text-muted">範圍不對？點灰色的字加入，點黃色的字取消</p>
                    <div class="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-2 text-sm leading-7">
                      <button
                        v-for="c in contextBoxes(s.range!, 8)"
                        :key="c.i"
                        type="button"
                        class="rounded-md px-1.5"
                        :class="c.inside ? 'bg-warn/30 font-medium' : 'bg-surface text-muted'"
                        @click="tapContext(s, c.i)"
                      >
                        {{ c.text }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <label class="label !mb-0">翻譯</label>
                    <button class="btn btn-soft px-3 py-1 text-xs" @click="translateSent(s)">
                      <Languages :size="14" /> 自動翻譯
                    </button>
                  </div>
                  <textarea v-model="s.translation" rows="2" class="input text-sm" />
                </div>

                <div class="space-y-1.5">
                  <label class="label !mb-0">當作哪些單字的例句</label>
                  <div v-if="words.length" class="flex flex-wrap gap-2">
                    <button
                      v-for="w in words"
                      :key="w.id"
                      type="button"
                      class="chip !px-3 !py-1.5 text-sm"
                      :class="{ 'chip-on': w.sids.includes(s.id) }"
                      @click="toggleLink(w, s.id)"
                    >
                      <Check v-if="w.sids.includes(s.id)" :size="14" /> {{ w.text }}
                    </button>
                  </div>
                  <p v-else class="text-sm text-muted">還沒有單字。</p>
                </div>

                <button
                  class="btn btn-ghost w-full text-sm text-danger"
                  @click="removeSentence(s.id)"
                >
                  <Trash2 :size="14" /> 不要這句
                </button>
              </div>
            </li>
          </ul>

          <form class="flex gap-2" @submit.prevent="addManualSentence">
            <input v-model="newSent" class="input py-2" placeholder="手動新增例句" />
            <button class="btn btn-soft shrink-0" type="submit"><Plus :size="16" /></button>
          </form>
        </template>
      </section>
    </div>

    <div
      v-if="words.length"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div class="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
        <button
          v-if="missingCount"
          class="btn btn-soft shrink-0 text-sm"
          :disabled="bulkBusy"
          @click="fillAll"
        >
          <LoaderCircle v-if="bulkBusy" :size="16" class="animate-spin" />
          <BookOpen v-else :size="16" />
          {{ bulkBusy ? '查詢中…' : `查 ${missingCount} 個意思` }}
        </button>
        <button
          class="btn btn-primary flex-1"
          :disabled="!deckId || !creatable.length"
          @click="create"
        >
          {{ deckId ? `建立 ${creatable.length} 張單字卡` : '請先選擇牌組' }}
        </button>
      </div>
    </div>

    <DictResultSheet
      v-model="showDict"
      :result="dictResult"
      :word="words.find((w) => w.id === dictFor)?.text ?? ''"
      :lang="lang"
      @apply="applyDict"
    />
  </div>
</template>
