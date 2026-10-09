<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Camera, ImagePlus, LoaderCircle, Plus, ScanText } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import SelectBox from '@/components/SelectBox.vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { LANGS } from '@/db/defaults'
import type { Lang } from '@/db/types'
import { extractWords, recognize, type OcrProgress } from '@/lib/ocr'
import { newVocabCard } from '@/lib/cards'
import { pathTo } from '@/lib/tree'
import { db, markLocalChange, stamp } from '@/db'

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()

const deckId = ref(String(route.query.deck ?? ''))
const lang = ref<Lang>((localStorage.getItem('sr.lastLang') as Lang) || 'en')
const image = ref<Blob | null>(null)
const imageUrl = ref('')
const text = ref('')
const running = ref(false)
const progress = ref<OcrProgress | null>(null)
const picked = ref(new Set<string>())
const extra = ref('')

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

const existing = computed(() => {
  const set = new Set<string>()
  for (const c of data.cardsByDeck.get(deckId.value) ?? []) {
    if (c.type === 'vocab') set.add(c.lang === 'en' ? c.word.trim().toLowerCase() : c.word.trim())
  }
  return set
})

const words = computed(() => extractWords(text.value, lang.value))

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  image.value = f
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = URL.createObjectURL(f)
  text.value = ''
  picked.value = new Set()
}

// accept pasted images too
function onPaste(e: ClipboardEvent) {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
  const f = item?.getAsFile()
  if (f) {
    image.value = f
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = URL.createObjectURL(f)
  }
}
window.addEventListener('paste', onPaste)
onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})

async function run() {
  if (!image.value) return
  running.value = true
  progress.value = null
  try {
    text.value = await recognize(image.value, lang.value, (p) => (progress.value = p))
    if (!text.value) ui.toast('沒有辨識到文字', 'error')
  } catch (e) {
    ui.toast(`辨識失敗：${e instanceof Error ? e.message : e}`, 'error')
  } finally {
    running.value = false
  }
}

watch(lang, () => (picked.value = new Set()))

function toggle(w: string) {
  const s = new Set(picked.value)
  if (s.has(w)) s.delete(w)
  else s.add(w)
  picked.value = s
}

function addExtra() {
  for (const w of extra.value.split(/[,，、\n]/)) {
    const t = w.trim()
    if (t) picked.value = new Set([...picked.value, lang.value === 'en' ? t.toLowerCase() : t])
  }
  extra.value = ''
}

const toCreate = computed(() => [...picked.value].filter((w) => !existing.value.has(w)))

async function create() {
  if (!deckId.value) return ui.toast('請選擇牌組', 'error')
  const list = toCreate.value
  if (!list.length) return
  const cards = list.map((w, i) => {
    const c = newVocabCard(deckId.value, lang.value, w)
    c.createdAt = c.createdAt + i
    c.updatedAt = stamp()
    return c
  })
  await db.cards.bulkPut(cards)
  markLocalChange()
  localStorage.setItem('sr.lastLang', lang.value)
  ui.toast(`已建立 ${cards.length} 張未完成的單字卡，記得補上意思`, 'success')
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
</script>

<template>
  <div>
    <PageHeader title="圖片辨識新增單字" />

    <div class="space-y-4">
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

      <section class="card space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <label class="btn btn-ghost cursor-pointer">
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
        <p v-if="!imageUrl" class="text-center text-xs text-muted">也可以直接貼上（Ctrl+V）截圖</p>
        <img
          v-if="imageUrl"
          :src="imageUrl"
          alt="要辨識的圖片"
          class="max-h-72 w-full rounded-2xl object-contain"
        />
        <button v-if="image" class="btn btn-primary w-full" :disabled="running" @click="run">
          <LoaderCircle v-if="running" :size="18" class="animate-spin" />
          <ScanText v-else :size="18" />
          {{ running ? statusText : '開始辨識' }}
        </button>
        <div class="space-y-0.5 text-xs text-muted">
          <p>在本機辨識，第一次使用某個語言時需要下載語言檔。</p>
          <p>英文約 4MB，日文／韓文約 10MB 以上。</p>
        </div>
      </section>

      <section v-if="text || picked.size" class="card space-y-3">
        <label class="label">辨識結果（可以直接修改）</label>
        <textarea v-model="text" rows="5" class="input text-sm" />
        <label class="label">點選要加入的單字</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="w in words"
            :key="w"
            class="chip text-sm"
            :class="{ 'chip-on': picked.has(w), 'opacity-40': existing.has(w) }"
            :disabled="existing.has(w)"
            :title="existing.has(w) ? '牌組裡已經有這個字' : ''"
            @click="toggle(w)"
          >
            {{ w }}
          </button>
          <span v-if="!words.length" class="text-sm text-muted">沒有找到單字</span>
        </div>
        <form class="flex gap-2" @submit.prevent="addExtra">
          <input v-model="extra" class="input py-2" placeholder="手動加入（可用逗號分隔多個）" />
          <button class="btn btn-soft shrink-0" type="submit"><Plus :size="16" /></button>
        </form>
        <div v-if="picked.size" class="flex flex-wrap gap-2 rounded-2xl bg-surface-2 p-3">
          <span class="w-full text-xs font-semibold text-muted">已選 {{ picked.size }} 個</span>
          <button v-for="w in picked" :key="w" class="chip chip-on text-sm" @click="toggle(w)">
            {{ w }} ×
          </button>
        </div>
      </section>

      <button
        class="btn btn-primary w-full py-3.5"
        :disabled="!toCreate.length || !deckId"
        @click="create"
      >
        建立 {{ toCreate.length }} 張單字卡（未完成）
      </button>
    </div>
  </div>
</template>
